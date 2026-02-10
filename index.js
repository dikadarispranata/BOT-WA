import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage
} from "@whiskeysockets/baileys"
import Pino from "pino"
import qrcode from "qrcode-terminal"
import fs from "fs"
import ffmpegPath from "ffmpeg-static"
import fluentFfmpeg from "fluent-ffmpeg"
import axios from "axios"
import { PassThrough } from "stream"

fluentFfmpeg.setFfmpegPath(ffmpegPath)

const CONFIG = {
  OWNER_NUMBER: "6289519221849@s.whatsapp.net",
  DB_PATH: "./database/group.json",
  SESSION_PATH: "./session",
  CACHE_TIMEOUT: 10 * 60 * 1000,
  DEFAULT_PP: "https://telegra.ph/file/241d7187431e61d6b74d3.jpg"
}

function cleanupSession() {
  const sessionPath = CONFIG.SESSION_PATH
  if (fs.existsSync(sessionPath)) {
    const files = fs.readdirSync(sessionPath)
    const hasRequiredFiles = files.includes("creds.json")
    if (!hasRequiredFiles) {
      console.log("🔄 Session corrupt, cleaning up...")
      fs.rmSync(sessionPath, { recursive: true, force: true })
      return false
    }
  }
  return true
}

class Database {
  constructor(path) {
    this.path = path
    this.ensureDirectory()
    this.load()
  }

  ensureDirectory() {
    const dir = this.path.substring(0, this.path.lastIndexOf("/"))
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  load() {
    if (!fs.existsSync(this.path)) {
      this.data = {}
      this.save()
    } else {
      this.data = JSON.parse(fs.readFileSync(this.path, "utf-8"))
    }
  }

  save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2))
  }

  getGroup(id) {
    if (!this.data[id]) {
      this.data[id] = {
        welcome: false,
        antilink: false,
        excluded: [CONFIG.OWNER_NUMBER],
        welcomeText: "👋 Selamat datang @user di @group",
        leftText: "👋 @user keluar dari @group"
      }
      this.save()
    }
    return this.data[id]
  }

  updateGroup(id, updates) {
    this.data[id] = { ...this.getGroup(id), ...updates }
    this.save()
  }
}

class GroupMetaCache {
  constructor(timeout = CONFIG.CACHE_TIMEOUT) {
    this.cache = new Map()
    this.timeout = timeout
  }

  async get(sock, jid) {
    const cached = this.cache.get(jid)
    const now = Date.now()
    
    if (cached && now - cached.time < this.timeout) {
      return cached.data
    }

    try {
      const meta = await sock.groupMetadata(jid)
      this.cache.set(jid, { data: meta, time: now })
      return meta
    } catch (error) {
      console.error(`Failed to fetch group metadata for ${jid}:`, error.message)
      throw error
    }
  }

  clear(jid) {
    if (jid) this.cache.delete(jid)
    else this.cache.clear()
  }
}

class MessageHelper {
  static extractText(m) {
    return (
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      ""
    )
  }

  static parseCommand(text) {
    if (!text.startsWith(".")) return null
    const [cmd, ...args] = text.slice(1).split(" ")
    return {
      cmd: cmd.toLowerCase(),
      args,
      query: args.join(" ")
    }
  }

  static getQuoted(m) {
    return m.message?.extendedTextMessage?.contextInfo?.quotedMessage
  }

  static hasImage(m) {
    const quoted = this.getQuoted(m)
    return !!(quoted?.imageMessage || m.message?.imageMessage)
  }

  static getImage(m) {
    const quoted = this.getQuoted(m)
    return quoted?.imageMessage || m.message?.imageMessage
  }

  static hasSticker(m) {
    const quoted = this.getQuoted(m)
    return !!quoted?.stickerMessage
  }

  static getSticker(m) {
    const quoted = this.getQuoted(m)
    return quoted?.stickerMessage
  }
}

class MediaProcessor {
  static async downloadMedia(message, type) {
    const stream = await downloadContentFromMessage(message, type)
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  static async brat(text) {
    const api = `https://api.ibeng.tech/api/maker/brat?text=${encodeURIComponent(text)}`
    const res = await axios.get(api, { responseType: "arraybuffer" })
    
    return new Promise((resolve, reject) => {
      const input = new PassThrough()
      input.end(Buffer.from(res.data))

      const chunks = []
      const output = new PassThrough()
      output.on("data", chunk => chunks.push(chunk))

      fluentFfmpeg(input)
        .outputOptions([
          "-vcodec libwebp",
          "-vf scale=512:512",
          "-loop 0",
          "-preset default",
          "-an"
        ])
        .toFormat("webp")
        .pipe(output)
        .on("finish", () => resolve(Buffer.concat(chunks)))
        .on("error", reject)
    })
  }
}

class CommandHandler {
  constructor(sock, db, cache) {
    this.sock = sock
    this.db = db
    this.cache = cache
  }

  async handleBrat(from, query) {
    if (!query) {
      return this.sock.sendMessage(from, { text: "❌ Masukkan teks!\nContoh: .brat halo dunia" })
    }

    try {
      const sticker = await MediaProcessor.brat(query)
      await this.sock.sendMessage(from, {
        sticker,
        packname: "Brat Bot",
        author: "Gemini"
      })
    } catch (error) {
      console.error("Brat error:", error.message)
      await this.sock.sendMessage(from, { text: "❌ Gagal membuat sticker brat" })
    }
  }

  async handleSticker(from, m) {
    if (!MessageHelper.hasImage(m)) {
      return this.sock.sendMessage(from, { text: "❌ Reply/kirim gambar!" })
    }

    try {
      const image = MessageHelper.getImage(m)
      const buffer = await MediaProcessor.downloadMedia(image, "image")
      
      await this.sock.sendMessage(from, {
        sticker: buffer,
        packname: "My Bot",
        author: "Gemini"
      })
    } catch (error) {
      console.error("Sticker error:", error.message)
      await this.sock.sendMessage(from, { text: "❌ Gagal membuat sticker" })
    }
  }

  async handleToImg(from, m) {
    if (!MessageHelper.hasSticker(m)) {
      return this.sock.sendMessage(from, { text: "❌ Reply stikernya!" })
    }

    try {
      const sticker = MessageHelper.getSticker(m)
      const buffer = await MediaProcessor.downloadMedia(sticker, "sticker")
      
      await this.sock.sendMessage(from, { image: buffer })
    } catch (error) {
      console.error("ToImg error:", error.message)
      await this.sock.sendMessage(from, { text: "❌ Gagal convert sticker" })
    }
  }

  async handleTiktok(from, query) {
    if (!query) {
      return this.sock.sendMessage(from, { text: "❌ Masukkan link TikTok!\nContoh: .tt https://vt.tiktok.com/xxx" })
    }

    try {
      const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(query)}`, {
        timeout: 30000
      })
      
      if (!res.data?.data?.play) {
        return this.sock.sendMessage(from, { text: "❌ Gagal mengunduh video" })
      }

      await this.sock.sendMessage(from, {
        video: { url: res.data.data.play },
        caption: "✅ TikTok No Watermark"
      })
    } catch (error) {
      console.error("TikTok error:", error.message)
      await this.sock.sendMessage(from, { text: "❌ Gagal mengunduh TikTok" })
    }
  }

  async handleInstagram(from, query) {
    if (!query) {
      return this.sock.sendMessage(from, { text: "❌ Masukkan link Instagram!\nContoh: .ig https://instagram.com/p/xxx" })
    }

    try {
      const res = await axios.get(
        `https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(query)}`,
        { timeout: 30000 }
      )
      
      if (!res.data?.data?.[0]?.url) {
        return this.sock.sendMessage(from, { text: "❌ Gagal mengunduh video" })
      }

      await this.sock.sendMessage(from, {
        video: { url: res.data.data[0].url },
        caption: "✅ Instagram"
      })
    } catch (error) {
      console.error("Instagram error:", error.message)
      await this.sock.sendMessage(from, { text: "❌ Gagal mengunduh Instagram" })
    }
  }

  async handleTagAll(from, isAdmin, participants) {
    if (!isAdmin) {
      return this.sock.sendMessage(from, { text: "❌ Hanya admin yang bisa menggunakan command ini" })
    }

    const mentions = participants.map(p => p.id)
    let text = "*👥 TAG ALL*\n\n"
    mentions.forEach(id => (text += `@${id.split("@")[0]} `))
    
    await this.sock.sendMessage(from, { text, mentions })
  }

  async handleHidetag(from, isAdmin, participants, query, m) {
    if (!isAdmin) {
      return this.sock.sendMessage(from, { 
        text: "❌ Hanya admin yang bisa menggunakan command ini" 
      })
    }

    const mentions = participants.map(p => p.id)
    let text = ""

    // Cek apakah ada quoted message (reply)
    const quoted = MessageHelper.getQuoted(m)
    
    if (quoted) {
      // Ambil text dari quoted message
      text = quoted.conversation || 
             quoted.extendedTextMessage?.text || 
             quoted.imageMessage?.caption ||
             quoted.videoMessage?.caption ||
             "📢 Pengumuman dari admin"
      
      console.log('✅ Using text from quoted message')
    } else if (query) {
      // Kalau gak ada reply, pakai query
      text = query
      console.log('✅ Using text from query')
    } else {
      // Default text
      text = "📢 Pengumuman dari admin"
      console.log('✅ Using default text')
    }
    
    await this.sock.sendMessage(from, { 
      text, 
      mentions 
    })
  }

  async handleMenu(from) {
    const menu = `🤖 *BOT MENU*

*📥 Downloader*
• .tt / .tiktok <link> - Download TikTok
• .ig / .instagram <link> - Download Instagram

*🎨 Sticker*
• .s / .sticker - Buat sticker dari gambar
• .toimg - Convert sticker ke gambar
• .brat <text> - Buat brat sticker

*👥 Group (Admin Only)*
• .tagall - Mention semua member
• .h / .hidetag <text> - Hidden tag (bisa reply pesan)
• .welcome on/off - Toggle welcome message
• .antilink on/off - Toggle antilink

*ℹ️ Info*
• .menu - Tampilkan menu ini
• .ping - Cek bot online

*💡 Cara pakai .h:*
• .h halo semua - Kirim text "halo semua"
• Reply pesan + ketik .h - Kirim text dari pesan yang di-reply`

    await this.sock.sendMessage(from, { text: menu })
  }

  async handlePing(from) {
    const start = Date.now()
    await this.sock.sendMessage(from, { text: "🏓 Pong!" })
    const ping = Date.now() - start
    await this.sock.sendMessage(from, { text: `⚡ Latency: ${ping}ms` })
  }

  async handleWelcome(from, isAdmin, query) {
    if (!isAdmin) {
      return this.sock.sendMessage(from, { text: "❌ Hanya admin yang bisa menggunakan command ini" })
    }

    const status = query.toLowerCase()
    if (!["on", "off"].includes(status)) {
      return this.sock.sendMessage(from, { text: "❌ Gunakan: .welcome on/off" })
    }

    this.db.updateGroup(from, { welcome: status === "on" })
    await this.sock.sendMessage(from, { 
      text: `✅ Welcome message ${status === "on" ? "diaktifkan" : "dinonaktifkan"}` 
    })
  }

  async handleAntilink(from, isAdmin, query) {
    if (!isAdmin) {
      return this.sock.sendMessage(from, { text: "❌ Hanya admin yang bisa menggunakan command ini" })
    }

    const status = query.toLowerCase()
    if (!["on", "off"].includes(status)) {
      return this.sock.sendMessage(from, { text: "❌ Gunakan: .antilink on/off" })
    }

    this.db.updateGroup(from, { antilink: status === "on" })
    await this.sock.sendMessage(from, { 
      text: `✅ Antilink ${status === "on" ? "diaktifkan" : "dinonaktifkan"}` 
    })
  }
}

class EventHandler {
  constructor(sock, db, cache) {
    this.sock = sock
    this.db = db
    this.cache = cache
    this.commandHandler = new CommandHandler(sock, db, cache)
  }

  async handleGroupParticipants(update) {
    const group = this.db.getGroup(update.id)
    if (!group.welcome) return

    let meta
    try {
      meta = await this.cache.get(this.sock, update.id)
    } catch (error) {
      console.error("Failed to get group meta:", error.message)
      return
    }

    for (const jid of update.participants) {
      let pp
      try {
        pp = await this.sock.profilePictureUrl(jid, "image")
      } catch {
        pp = CONFIG.DEFAULT_PP
      }

      const text = update.action === "add" ? group.welcomeText : group.leftText
      
      try {
        await this.sock.sendMessage(update.id, {
          image: { url: pp },
          caption: text
            .replace("@user", `@${jid.split("@")[0]}`)
            .replace("@group", meta.subject),
          mentions: [jid]
        })
      } catch (error) {
        console.error("Failed to send welcome message:", error.message)
      }
    }
  }

  async handleMessages(upsert) {
    const m = upsert.messages[0]
    
    console.log('\n📨 New message received!')
    console.log('From:', m.key.remoteJid)
    console.log('Is from me?', m.key.fromMe)
    console.log('Has message?', !!m?.message)
    
    if (!m?.message || m.key.fromMe) {
      console.log('⏭️ Message skipped (no content or from bot)')
      return
    }

    const from = m.key.remoteJid
    const isGroup = from.endsWith("@g.us")
    const text = MessageHelper.extractText(m)
    const sender = m.key.participant || from

    console.log('Message type:', isGroup ? 'GROUP' : 'PRIVATE')
    console.log('Text:', text)
    console.log('Sender:', sender)

    if (isGroup) {
      const group = this.db.getGroup(from)
      
      if (group.antilink && text.includes("chat.whatsapp.com")) {
        console.log('🚫 Antilink triggered!')
        try {
          const meta = await this.cache.get(this.sock, from)
          const myId = this.sock.user.id.split(":")[0]
          const botP = meta.participants.find(p => p.id?.includes(myId))
          const senderP = meta.participants.find(p => p.id === sender)
          
          const isAdmin = !!senderP?.admin
          const isBotAdmin = !!botP?.admin

          if (!isAdmin && isBotAdmin) {
            await this.sock.sendMessage(from, { text: "🚫 Link grup terdeteksi! Member akan di-kick." })
            await this.sock.groupParticipantsUpdate(from, [sender], "remove")
            return
          }
        } catch (error) {
          console.error("Antilink error:", error.message)
        }
      }
    }

    const parsed = MessageHelper.parseCommand(text)
    
    console.log('Parsed command:', parsed)
    
    if (!parsed) {
      console.log('⏭️ Not a command (no . prefix)')
      return
    }

    const { cmd, query } = parsed
    console.log(`🎯 Executing command: ${cmd}`)

    let isAdmin = false
    let participants = []

    if (isGroup) {
      const adminCommands = ["tagall", "h", "hidetag", "welcome", "antilink"]
      if (adminCommands.includes(cmd)) {
        try {
          const meta = await this.cache.get(this.sock, from)
          participants = meta.participants
          const senderP = participants.find(p => p.id === sender)
          isAdmin = !!senderP?.admin
          console.log('Is admin?', isAdmin)
        } catch (error) {
          console.error("Failed to get admin status:", error.message)
          return
        }
      }
    }

    try {
      switch (cmd) {
        case "brat":
          console.log('→ Handling brat')
          await this.commandHandler.handleBrat(from, query)
          break
        case "s":
        case "sticker":
          console.log('→ Handling sticker')
          await this.commandHandler.handleSticker(from, m)
          break
        case "toimg":
          console.log('→ Handling toimg')
          await this.commandHandler.handleToImg(from, m)
          break
        case "tt":
        case "tiktok":
          console.log('→ Handling tiktok')
          await this.commandHandler.handleTiktok(from, query)
          break
        case "ig":
        case "instagram":
          console.log('→ Handling instagram')
          await this.commandHandler.handleInstagram(from, query)
          break
        case "tagall":
          console.log('→ Handling tagall')
          await this.commandHandler.handleTagAll(from, isAdmin, participants)
          break
        case "h":
        case "hidetag":
          console.log('→ Handling hidetag')
          await this.commandHandler.handleHidetag(from, isAdmin, participants, query, m)
          break
        case "welcome":
          console.log('→ Handling welcome')
          await this.commandHandler.handleWelcome(from, isAdmin, query)
          break
        case "antilink":
          console.log('→ Handling antilink')
          await this.commandHandler.handleAntilink(from, isAdmin, query)
          break
        case "menu":
          console.log('→ Handling menu')
          await this.commandHandler.handleMenu(from)
          break
        case "ping":
          console.log('→ Handling ping')
          await this.commandHandler.handlePing(from)
          break
        default:
          console.log(`⚠️ Unknown command: ${cmd}`)
      }
      console.log('✅ Command executed successfully')
    } catch (error) {
      console.error(`❌ Command error [${cmd}]:`, error)
    }
  }
}

async function startBot() {
  try {
    cleanupSession()
    
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.SESSION_PATH)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      auth: state,
      version,
      logger: Pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Bot", "Chrome", "1.0.0"],
      markOnlineOnConnect: true
    })

    const db = new Database(CONFIG.DB_PATH)
    const cache = new GroupMetaCache()
    const eventHandler = new EventHandler(sock, db, cache)

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
      if (qr) {
        console.log("📱 Scan QR code:")
        qrcode.generate(qr, { small: true })
      }
      
      if (connection === "open") {
        console.log("✅ BOT ONLINE")
      }
      
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        
        console.log("❌ Connection closed")
        console.log("Status code:", statusCode)
        console.log("Reconnecting:", shouldReconnect)
        
        if (shouldReconnect) {
          setTimeout(() => startBot(), 3000)
        }
      }
    })

    sock.ev.on("group-participants.update", (u) => {
      eventHandler.handleGroupParticipants(u).catch(err => 
        console.error("Group participants error:", err.message)
      )
    })
    
    sock.ev.on("messages.upsert", (m) => {
      eventHandler.handleMessages(m).catch(err => 
        console.error("Message handler error:", err.message)
      )
    })

  } catch (error) {
    console.error("❌ Bot startup error:", error.message)
    
    if (error.message?.includes("private key") || 
        error.message?.includes("Incorrect") ||
        error.message?.includes("creds")) {
      console.log("🔄 Deleting corrupt session...")
      try {
        fs.rmSync(CONFIG.SESSION_PATH, { recursive: true, force: true })
      } catch {}
    }
    
    console.log("🔄 Retrying in 5 seconds...")
    setTimeout(() => startBot(), 5000)
  }
}

startBot().catch(error => {
  console.error("❌ Fatal error:", error)
  process.exit(1)
})