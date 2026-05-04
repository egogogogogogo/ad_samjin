import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Checking app_config...");
    const { data, error } = await supabase.from('app_config').select('*').limit(1);
    console.log("SELECT result:", data);
    console.log("ERROR:", error);
}
run();
