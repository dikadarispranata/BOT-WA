# WhatsApp Bot - Advanced Multi-Purpose Bot

A powerful, feature-rich WhatsApp bot built with Baileys library, offering automated group management, media processing, and content downloading capabilities.

## 🌟 Features

### 📥 Media Downloaders
- **TikTok Downloader** - Download TikTok videos without watermark
- **Instagram Downloader** - Download Instagram videos and reels
- Fast and reliable downloading with error handling

### 🎨 Sticker & Media Tools
- **Image to Sticker** - Convert any image to WhatsApp sticker
- **Sticker to Image** - Convert stickers back to images
- **Brat Sticker Generator** - Create trendy "brat" style stickers with custom text
- Support for quoted/replied messages

### 👥 Group Management (Admin Only)
- **Tag All** - Mention all group members with visible tags
- **Hidetag** - Send messages that notify all members without showing the tag list
  - Supports custom text
  - Can reply to messages to use their content
- **Welcome Messages** - Automated welcome/goodbye messages with profile pictures
- **Anti-Link Protection** - Automatically remove members who send group invite links
- Configurable per-group settings

### ℹ️ Utility Commands
- **Ping** - Check bot response time and latency
- **Menu** - Display comprehensive command list
- Real-time status monitoring

## 🏗️ Architecture

Built with clean, maintainable code structure:

- **Class-Based Design** - Organized into modular classes for better code management
- **Database Management** - JSON-based persistent storage for group settings
- **Caching System** - Efficient group metadata caching (10-minute TTL)
- **Error Handling** - Comprehensive try-catch blocks with user feedback
- **Auto-Reconnect** - Automatic reconnection on connection loss
- **Session Management** - Automatic detection and cleanup of corrupted sessions

### Core Components

```
📦 Bot Architecture
├── Database Class - Group settings management
├── GroupMetaCache - Performance optimization
├── MessageHelper - Message parsing utilities
├── MediaProcessor - Media handling & conversion
├── CommandHandler - Command execution logic
└── EventHandler - Event coordination
```

## 🚀 Installation

### Prerequisites
- Node.js v16 or higher
- npm or yarn package manager

### Setup

1. **Clone or download the repository**
```bash
git clone <your-repo-url>
cd whatsapp-bot
```

2. **Install dependencies**
```bash
npm install
```

Required packages:
- @whiskeysockets/baileys - WhatsApp Web API
- pino - Logging
- qrcode-terminal - QR code display
- fluent-ffmpeg - Media processing
- ffmpeg-static - FFmpeg binary
- axios - HTTP requests

3. **Configure the bot**

Edit `CONFIG` object in `index.js`:
```javascript
const CONFIG = {
  OWNER_NUMBER: "your_number@s.whatsapp.net",
  DB_PATH: "./database/group.json",
  SESSION_PATH: "./session",
  CACHE_TIMEOUT: 10 * 60 * 1000,
  DEFAULT_PP: "default_profile_pic_url"
}
```

4. **Run the bot**
```bash
node index.js
```

5. **Scan QR Code**
- QR code will appear in terminal
- Scan with WhatsApp on your phone
- Wait for "✅ BOT ONLINE" message

## 📋 Command List

### 🎨 Sticker Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `.s` or `.sticker` | Convert image to sticker | Send/reply to image with command |
| `.toimg` | Convert sticker to image | Reply to sticker with command |
| `.brat <text>` | Create brat sticker | `.brat hello world` |

### 📥 Downloader Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `.tt` or `.tiktok <url>` | Download TikTok video | `.tt https://vt.tiktok.com/xxx` |
| `.ig` or `.instagram <url>` | Download Instagram video | `.ig https://instagram.com/p/xxx` |

### 👥 Group Commands (Admin Only)
| Command | Description | Usage |
|---------|-------------|-------|
| `.tagall` | Tag all members (visible) | `.tagall` |
| `.h` or `.hidetag` | Hidden tag all members | `.h <message>` or reply + `.h` |
| `.welcome on/off` | Toggle welcome messages | `.welcome on` |
| `.antilink on/off` | Toggle anti-link protection | `.antilink on` |

### ℹ️ Info Commands
| Command | Description |
|---------|-------------|
| `.menu` | Show all commands |
| `.ping` | Check bot latency |

## 🔧 Running in Background

### Windows

**Option 1: VBS Script (Silent Background)**
```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\path\to\bot"
WshShell.Run "cmd /c node index.js", 0, False
```
Save as `start-bot.vbs` and double-click to run.

**Option 2: PM2 (Process Manager)**
```bash
npm install -g pm2
pm2 start index.js --name whatsapp-bot
pm2 save
pm2 startup
```

**Option 3: NSSM (Windows Service)**
```bash
nssm install WhatsAppBot "C:\path\to\node.exe" "C:\path\to\index.js"
nssm start WhatsAppBot
```

### Linux/Mac

**Using PM2:**
```bash
npm install -g pm2
pm2 start index.js --name whatsapp-bot
pm2 startup
pm2 save
```

**Using systemd (Linux):**
Create `/etc/systemd/system/whatsapp-bot.service`:
```ini
[Unit]
Description=WhatsApp Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/bot
ExecStart=/usr/bin/node index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable whatsapp-bot
sudo systemctl start whatsapp-bot
```

## 🛠️ Configuration

### Group Settings

Each group has its own settings stored in `database/group.json`:

```json
{
  "group_id@g.us": {
    "welcome": true,
    "antilink": false,
    "welcomeText": "👋 Welcome @user to @group",
    "leftText": "👋 @user left @group",
    "excluded": ["owner_number@s.whatsapp.net"]
  }
}
```

### Customization

**Change command prefix:**
```javascript
// In MessageHelper.parseCommand()
if (!text.startsWith(".")) return null  // Change "." to your prefix
```

**Modify welcome message:**
Use `.welcome on` in group, or edit database directly.

**Add new commands:**
1. Create handler in `CommandHandler` class
2. Add case in `EventHandler.handleMessages()` switch
3. Update menu in `handleMenu()`

## 📊 Performance Features

- **Caching** - Group metadata cached for 10 minutes
- **Lazy Loading** - Admin status only checked when needed
- **Async Operations** - Non-blocking command execution
- **Connection Pooling** - Efficient API usage
- **Auto-Cleanup** - Corrupted session auto-detection

## 🔒 Security Features

- **Admin Verification** - Commands restricted to group admins
- **Anti-Spam** - Rate limiting on API calls
- **Session Protection** - Automatic session validation
- **Error Isolation** - Individual command failures don't crash bot
- **Safe Reconnection** - Prevents logout on temporary disconnects

## 🐛 Troubleshooting

### Bot Not Responding
1. Check console for error messages
2. Verify bot is admin (for group commands)
3. Ensure you're not messaging from the bot's number
4. Check command syntax

### Session Issues
Delete session folder and re-scan QR code:
```bash
rm -rf session
node index.js
```

### Connection Drops
Bot auto-reconnects. If persistent:
1. Check internet connection
2. Update Baileys: `npm update @whiskeysockets/baileys`
3. Clear session and re-authenticate

### Command Not Working
- Ensure command starts with `.` (or your custom prefix)
- Check if you're admin (for admin commands)
- Verify correct syntax in `.menu`

## 📈 Future Enhancements

Planned features:
- [ ] Multi-language support
- [ ] Database migration to MongoDB/SQLite
- [ ] User permission system
- [ ] Custom command aliases
- [ ] Scheduled messages
- [ ] Analytics dashboard
- [ ] AI integration (ChatGPT/Claude)
- [ ] Voice message support
- [ ] Poll creation
- [ ] Reminders/timers

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This bot is for educational purposes. Users are responsible for:
- Complying with WhatsApp Terms of Service
- Respecting copyright when downloading content
- Using automation features responsibly
- Managing spam and abuse

The developers are not responsible for misuse of this software.

## 💬 Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Provide error logs and steps to reproduce

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [FFmpeg](https://ffmpeg.org/) - Media processing
- All contributors and users

---

**Made with ❤️ by [Dika Daris Pranata]**

⭐ Star this repository if you find it helpful!
