const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const mongoose = require('mongoose');

const userModel = require('./models/user'); // Import the User model
const admin = require('firebase-admin');

const serviceAccount = require('../firebase-config.json');
const bcrypt = require('bcrypt');


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
const saltRounds = 10;

app.post('/signup', async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!['superadmin', 'manager', 'senior', 'resident', 'intern'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
    }

    try {
        // Hash the password before saving it
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user in Firebase Authentication
        const firebaseUser = await admin.auth().createUser({
            email,
            password: hashedPassword,  // Firebase will handle the hashed password correctly
        });

        // Save user details in MongoDB with hashed password
        const user = new userModel({
            name,
            email,
            password: hashedPassword, // Store the hashed password in MongoDB
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
        // First, verify the user with Firebase by their email
        const userRecord = await admin.auth().getUserByEmail(email);

        // If the user exists, you can proceed to create the token
        if (userRecord) {
            // Create a custom token using the user's UID
            const firebaseToken = await admin.auth().createCustomToken(userRecord.uid);
            console.log('Firebase token:', firebaseToken);

            // Find user in MongoDB
            const user = await userModel.findOne({ email });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            if (!user.isValidated) {
                return res.status(403).json({ message: 'Account not validated' });
            }

            // Return the Firebase token and user role
            res.status(200).json({ token: firebaseToken, role: user.role });
        } else {
            return res.status(404).json({ message: 'User not found in Firebase' });
        }

    } catch (err) {
        console.error('Error during sign-in:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});




