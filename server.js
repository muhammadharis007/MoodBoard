require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Mongoose connection (non-blocking — server starts regardless)
// ---------------------------------------------------------------------------
async function connectDB(retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅  Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`❌  MongoDB connection attempt ${i}/${retries} failed:`, err.message);
      if (i < retries) {
        console.log(`⏳  Retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  console.error('⚠️  Could not connect to MongoDB — server running without DB');
}

connectDB();

// ---------------------------------------------------------------------------
// Schema & Model
// ---------------------------------------------------------------------------
const postSchema = new mongoose.Schema({
  message: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['Course', 'Facility', 'General', 'Food', 'Events'],
    default: 'General',
  },
  mood: {
    type: String,
    default: '',
  },
  upvotes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const Post = mongoose.model('Post', postSchema);

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// GET  /api/posts — return all posts sorted by upvotes desc, then newest first
app.get('/api/posts', async (_req, res) => {
  try {
    const posts = await Post.find().sort({ upvotes: -1, createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts — create a new post
app.post('/api/posts', async (req, res) => {
  try {
    const { message, category, mood } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const post = await Post.create({
      message: message.trim(),
      category: category || 'General',
      mood: mood || '',
    });
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT  /api/posts/:id/upvote — increment upvote count by 1
app.put('/api/posts/:id/upvote', async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { upvotes: 1 } },
      { new: true }
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/posts/:id — delete a post
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀  MoodBoard server running on http://localhost:${PORT}`);
});
