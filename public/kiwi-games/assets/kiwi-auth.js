/* ============================================================================
 *  Kiwi Games — shared auth + scores helper (loaded on pages that need the
 *  Supabase SDK: login.html and the gallery index.html). Game pages use the
 *  lightweight inline guard instead (no SDK needed) — see build.mjs.
 *
 *  Depends on: window.KIWI_AUTH_CONFIG (assets/kiwi-auth-config.js) and the
 *  Supabase UMD bundle (loaded from a <script> tag before this file).
 * ========================================================================== */
(function () {
  var CFG = window.KIWI_AUTH_CONFIG || {};
  var K = (window.Kiwi = window.Kiwi || {});
  K.enabled = !!CFG.enabled;

  var client = null;
  K.client = function () {
    if (client) return client;
    if (!window.supabase || !CFG.url || !CFG.anonKey) return null;
    client = window.supabase.createClient(CFG.url, CFG.anonKey);
    return client;
  };

  // --- Session ---------------------------------------------------------------
  // Read the STORED session first (local, no network) — this reliably detects "logged in" even
  // when the network validation of getUser() would fail (which it can with publishable keys).
  // Only fall back to getUser() when there's no local session at all.
  K.getUser = async function () {
    var c = K.client(); if (!c) return null;
    try {
      var s = await c.auth.getSession();
      if (s && s.data && s.data.session && s.data.session.user) return s.data.session.user;
    } catch (e) { /* fall through */ }
    try { var r = await c.auth.getUser(); return (r && r.data) ? r.data.user : null; } catch (e) { return null; }
  };
  K.requireAuth = async function () {
    if (!K.enabled) return true;               // auth off → open site
    var u = await K.getUser();
    if (!u) { location.href = CFG.loginPath || 'login.html'; return false; }
    return u;
  };

  // --- Auth actions (used by login.html) -------------------------------------
  K.signUp = async function (email, password, name) {
    var c = K.client(); if (!c) throw new Error('Auth not configured');
    // After the user clicks the confirmation email, bring them back to the games (logged in).
    var redirect = location.origin + location.pathname.replace(/[^/]*$/, (CFG.homePath || 'index.html'));
    return c.auth.signUp({ email: email, password: password, options: { data: { display_name: name || '' }, emailRedirectTo: redirect } });
  };
  K.signIn = async function (email, password) {
    var c = K.client(); if (!c) throw new Error('Auth not configured');
    return c.auth.signInWithPassword({ email: email, password: password });
  };
  K.signInWithGoogle = async function () {
    var c = K.client(); if (!c) throw new Error('Auth not configured');
    var redirect = location.origin + location.pathname.replace(/[^/]*$/, (CFG.homePath || 'index.html'));
    return c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect } });
  };
  K.signOut = async function () {
    var c = K.client(); if (c) { try { await c.auth.signOut(); } catch (e) {} }
    location.href = CFG.loginPath || 'login.html';
  };
  // --- Password reset --------------------------------------------------------
  // Emails a reset link that lands on reset.html (a recovery session), where updatePassword sets
  // the new password. reset.html must be in the project's allowed Redirect URLs.
  K.resetPassword = async function (email) {
    var c = K.client(); if (!c) throw new Error('Auth not configured');
    var redirect = location.origin + location.pathname.replace(/[^/]*$/, 'reset.html');
    return c.auth.resetPasswordForEmail(email, { redirectTo: redirect });
  };
  K.updatePassword = async function (password) {
    var c = K.client(); if (!c) throw new Error('Auth not configured');
    return c.auth.updateUser({ password: password });
  };

  // --- High scores (best score per game, per player) -------------------------
  // Table: high_scores(user_id uuid, game text, score int, updated_at timestamptz)
  K.saveScore = async function (game, score) {
    var c = K.client(); if (!c || !K.enabled) return;
    var u = await K.getUser(); if (!u) return;
    try {
      var r = await c.from('high_scores').select('score').eq('user_id', u.id).eq('game', game).maybeSingle();
      var best = r.data ? r.data.score : -1;
      if (score > best) {
        await c.from('high_scores').upsert(
          { user_id: u.id, game: game, score: Math.round(score), updated_at: new Date().toISOString() },
          { onConflict: 'user_id,game' }
        );
      }
    } catch (e) { /* non-fatal */ }
  };
  K.leaderboard = async function (game, limit) {
    var c = K.client(); if (!c) return [];
    try {
      var r = await c.from('high_scores').select('score, profiles(display_name)').eq('game', game)
        .order('score', { ascending: false }).limit(limit || 10);
      return r.data || [];
    } catch (e) { return []; }
  };
  // Every (best) score, every player — used to compute Kiwi IQ (per-game percentile ranking).
  K.allScores = async function () {
    var c = K.client(); if (!c) return [];
    try {
      var r = await c.from('high_scores').select('user_id, game, score, profiles(display_name)').limit(20000);
      return r.data || [];
    } catch (e) { return []; }
  };
})();
