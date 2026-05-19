const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const hasSupabaseCredentials =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = hasSupabaseCredentials
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

module.exports = supabase;
