

async function testLogin() {
    const apiUrl = 'https://script.google.com/macros/s/AKfycbzpIkOaGNqNbLIGh71tgr-31AhgMt0IX4cq6qrbQk9yZo4yn6T6lD9bbPXXvTGIR1oR/exec';
    console.log('Testing login with wrong credentials...');
    
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
