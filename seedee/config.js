// Where votes are stored.
// Leave both values empty to run in preview mode: votes stay in the visitor's own browser.
// To collect votes from everyone, create a Supabase project, run setup.sql in its SQL editor,
// then paste the project URL and the public "anon" key here. Both are safe to publish:
// setup.sql only lets the public cast a vote and read totals, never names or comments.
window.SEEDEE_CONFIG = {
  supabaseUrl: '',
  supabaseKey: ''
};
