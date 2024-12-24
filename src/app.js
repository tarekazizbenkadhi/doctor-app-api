const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const mongoose = require('mongoose');

const userModel = require('./models/user'); // Import the User model
const admin = require('firebase-admin');

const serviceAccount = require('../firebase-config.json');


require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.json());

// MongoDB connection
console.log(process.env.MONGO_URI); 
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => console.error('MongoDB connection error:', err));

// Basic route
app.get('/', (req, res) => {
    res.send('API is running!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
app.post('/signup', async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!['superadmin', 'manager', 'senior', 'resident', 'intern'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
    }

    try {
        // Create user in Firebase Authentication
        const firebaseUser = await admin.auth().createUser({
            email,
            password,
        });

        // Save user details in MongoDB
        const user = new userModel({
            name,
            email,
            password:firebaseUser?.uid,
            role,
            isValidated: false,
        });
        await user.save();

        res.status(201).json({ message: 'User registered successfully. Awaiting validation.', firebaseUid: firebaseUser.uid });
    } catch (err) {
        res.status(400).json({ message: 'Error creating user', error: err.message });
    }
});
app.put('/validate-account', async (req, res) => {
    const { email } = req.body;

    try {
        // Find the user in MongoDB
        //const user = await User.findById(userId);
//if (!user) return res.status(404).json({ message: 'User not found' });

        // Update validation status

        await userModel
                .findOneAndUpdate({
                  email: email,
                })
                .updateOne({
                  isValidated: true,
                });

        res.status(200).json({ message: 'User validated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error validating account', error: err.message });
    }
});
app.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Verify user credentials with Firebase
        const firebaseToken = await admin.auth().createCustomToken(email);
      

        // Find user in MongoDB
        const user = await userModel.findOne({ email });
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.isValidated) return res.status(403).json({ message: 'Account not validated' });

        res.status(200).json({ token: firebaseToken, role: user.role });
    } catch (err) {
        res.status(401).json({ message: 'Invalid credentials', error: err.message });
    }
});


