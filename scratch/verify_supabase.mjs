
async function testSync() {
    const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
    const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';
    const testDate = new Date().toISOString().split('T')[0];
    
    console.log('Inserting test data via REST API...');
    
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/production_data`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({ 
                date: testDate, 
                month: new Date().getMonth() + 1, 
                week_num: 'W1', 
                final_qty: 500000, 
                defect_qty: 100,
                seong_qty: 500000,
                jorip_qty: 500000,
                reel_qty: 500000,
                remark: 'AI Verification Test Data'
            })
        });

        if (res.ok) {
            console.log('Successfully inserted test data!');
        } else {
            const err = await res.text();
            console.error('Error:', err);
        }
    } catch (e) {
        console.error('Fetch Error:', e);
    }
}

testSync();
