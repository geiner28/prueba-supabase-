const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Faltan las variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY. Revisa tu archivo .env"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
