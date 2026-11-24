// Where votes are stored.
// The project URL and the public ("publishable") key of the Supabase project that holds the
// votes. Both are safe to publish: setup.sql only lets the public cast a vote and read
// totals, never names or comments. Never put the secret / service_role key here.
// With both values empty the page runs in preview mode: votes stay in the visitor's browser.
window.SEEDEE_CONFIG = {
  supabaseUrl: 'https://clgoairqitcdnthkkcpc.supabase.co',
  supabaseKey: 'sb_publishable_x3IAIrw4gOniTh0SxZDOgQ_z0Ai3F8W'
};
