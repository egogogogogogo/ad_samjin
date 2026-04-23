
async function testLogin() {
    const apiUrl = 'https://script.google.com/macros/s/AKfycbyMD-xl89BwEEfhpeQjyaxe8-xMgAnCVeJJ7nw4nc43wg5OksEIN6xj15468Nfr6LPc/exec';
    console.log('Testing login with wrong credentials on ID: AKfycbyMD...');
    
    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            body: JSON.stringify({
                type: 'LOGIN',
                payload: { id: 'wrong', pw: 'wrong' }
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        const text = await res.text();
        console.log('Response Status:', res.status);
        console.log('Response Body:', text);
    } catch (e) {
        console.error('Error:', e);
    }
}

testLogin();
