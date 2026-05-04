import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDB() {
    console.log('--- Partners ---');
    const { data: partners, error: pError } = await supabase.from('partners').select('*');
    if (pError) console.error(pError);
    else console.table(partners);

    console.log('--- Profiles ---');
    const { data: profiles, error: prError } = await supabase.from('profiles').select('*');
    if (prError) console.error(prError);
    else console.table(profiles);
}

checkDB();
