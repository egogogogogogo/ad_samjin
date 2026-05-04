import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.from('app_config').upsert({
        key: 'test_key',
        value: { test: 123 }
    }, { onConflict: 'key' });
    
    console.log("Upsert error:", error);
}
run();
