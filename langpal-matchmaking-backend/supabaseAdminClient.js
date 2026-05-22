const { createClient } = require("@supabase/supabase-js");

// create supabase asmin client using service role key
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabaseAdmin;