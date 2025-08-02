const path = require('path');
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active chats { code: { messages: [], users: Set } }
const activeChats = new Map();

app.use(express.static(path.join(__dirname, 'public')));

io.on("connection", (socket) => {
  console.log("New user connected");
  let currentRoom = null;
  let currentUsername = null;

  // Join a chat room with a username
  socket.on("join", (code, username) => {
    if (!/^\d{6}$/.test(code)) {
      console.log("Invalid room code");
      return;
    }

    // Generate random username if none provided
    if (!username || username.trim().length === 0) {
      username = `User${Math.floor(Math.random() * 1000)}`;
    }

    currentRoom = code;
    currentUsername = username;
    socket.join(code);

    // Initialize room if it doesn't exist
    if (!activeChats.has(code)) {
      activeChats.set(code, {
        messages: [],
        users: new Set()
      });
      console.log(`Created new room ${code}`);
    }

    // Get the room data
    const room = activeChats.get(code);

    // Add user to room
    room.users.add(username);
    console.log(`${username} joined room ${code}`);

    // Notify room about new user
    io.to(code).emit("userJoined", username);
    io.to(code).emit("userList", Array.from(room.users));

    // Send chat history to the new user
    socket.emit("history", room.messages);
  });

  // Handle messages
  socket.on("message", (code, message) => {
    if (!activeChats.has(code) || !currentUsername) return;

    const room = activeChats.get(code);
    const fullMessage = `${currentUsername}: ${message}`;
    
    room.messages.push(fullMessage);
    io.to(code).emit("message", fullMessage);
  });

  // Clean up on disconnect
  socket.on("disconnect", () => {
    if (!currentRoom || !currentUsername) return;

    const room = activeChats.get(currentRoom);
    if (!room) return;

    // Remove user from room
    room.users.delete(currentUsername);
    console.log(`${currentUsername} left room ${currentRoom}`);

    // Notify remaining users
    io.to(currentRoom).emit("userLeft", currentUsername);
    io.to(currentRoom).emit("userList", Array.from(room.users));

    // Delete room if empty (after 30 seconds)
    if (room.users.size === 0) {
      setTimeout(() => {
        const roomCheck = activeChats.get(currentRoom);
        if (roomCheck && roomCheck.users.size === 0) {
          activeChats.delete(currentRoom);
          console.log(`Room ${currentRoom} deleted (empty)`);
        }
      }, 30000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});