const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hubspot-email-sync')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    try {
      // Drop the emails collection
      console.log('Dropping emails collection...');
      await mongoose.connection.db.dropCollection('emails');
      console.log('Emails collection dropped successfully');
    } catch (error) {
      if (error.code === 26) {
        console.log('Collection does not exist, nothing to drop');
      } else {
        console.error('Error dropping collection:', error);
      }
    }
    
    // Create the Email model with the correct schema
    const Email = require('../models/Email');
    
    // Create a dummy document to ensure the collection exists with the correct indices
    console.log('Creating a dummy document to initialize the collection...');
    const dummyEmail = new Email({
      threadId: 'dummy-thread-id-to-be-deleted',
      userEmail: 'dummy@example.com',
      subject: 'Dummy Email',
      provider: 'gmail',
      participants: ['dummy@example.com'],
      messages: [{
        messageId: 'dummy-message-id',
        sender: 'dummy@example.com',
        recipient: 'dummy@example.com',
        subject: 'Dummy Email',
        body: 'This is a dummy email to initialize the collection with the correct indices.',
        timestamp: new Date(),
        provider: 'gmail'
      }],
      latestTimestamp: new Date()
    });
    
    await dummyEmail.save();
    console.log('Dummy document created successfully');
    
    // Now delete the dummy document
    await Email.deleteOne({ threadId: 'dummy-thread-id-to-be-deleted' });
    console.log('Dummy document deleted');
    
    // Now the collection exists, so we can verify the indices
    try {
      const indices = await mongoose.connection.db.collection('emails').indexes();
      console.log('Current indices:');
      indices.forEach(index => {
        console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
      });
    } catch (error) {
      console.error('Error getting indices:', error);
    }
    
    console.log('Email collection reset successfully. The application will now use the correct indexing strategy.');
    
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
