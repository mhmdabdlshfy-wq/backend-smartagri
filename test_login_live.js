const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const testLoginLive = async () => {
    try {
        const url = 'http://localhost:5000/api/auth/login';
        console.log(`📡 Attempting login to: ${url}`);

        const response = await axios.post(url, {
            username: 'admin',
            password: '1234'
        });

        console.log('✅ LOGIN SUCCESSFUL!');
        console.log('   User:', response.data.user.username);
        console.log('   Token:', response.data.token.substring(0, 20) + '...');
        process.exit(0);

    } catch (err) {
        console.error('❌ LOGIN FAILED!');
        if (err.response) {
            console.error('   Status:', err.response.status);
            console.error('   Message:', err.response.data.message);
        } else if (err.code === 'ECONNREFUSED') {
            console.error('   Connection Refused! Is the server running on port 5000?');
        } else {
            console.error(err.message);
        }
        process.exit(1);
    }
};

testLoginLive();
