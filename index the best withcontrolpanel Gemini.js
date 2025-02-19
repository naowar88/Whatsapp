const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const express = require("express");
const fs = require("fs").promises;
const axios = require("axios");
const path = require("path");
const app = express();

const respondedMessages = new Map();
const optionsFilePath = "options.json";
const GEMINI_API_KEY = "AIzaSyCZAGKHrKiSHDscDNvP9WqZm9HwPtiO8bE"; // 🔹 استبدلها بمفتاحك الفعلي

app.use("/panel", express.static(path.join(__dirname, "public")));
app.use(express.json());

async function loadOptions() {
    try {
        const data = await fs.readFile(optionsFilePath, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error("❌ خطأ في قراءة ملف options.json:", error);
        return { options: [] };
    }
}

async function saveOptions(options) {
    try {
        await fs.writeFile(optionsFilePath, JSON.stringify(options, null, 2));
    } catch (error) {
        console.error("❌ خطأ في حفظ ملف options.json:", error);
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("✅ تم توليد رمز QR! انتقل إلى الرابط لمسحه ضوئيًا.");
            qrcode.toDataURL(qr, (err, url) => {
                if (err) console.error("❌ خطأ في إنشاء QR:", err);
                global.qrCodeUrl = url;
            });
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log("🚨 تم فصل الاتصال، جارٍ إعادة الاتصال...", shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === "open") {
            console.log("✅ تم الاتصال بنجاح!");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        console.log(`📩 رسالة جديدة من ${sender}: ${text}`);

        if (!respondedMessages.has(sender)) {
            const options = await loadOptions();
            const optionsText = options.options.map(opt => `${opt.id}️⃣ - ${opt.label}`).join("\n");
            respondedMessages.set(sender, "انتظار_الاختيار");
            await sock.sendMessage(sender, { text: `📅 *مرحبا بك في شركة فيد الرجاء اختيار أحد الخدمات التالية او اختر خيار سؤال آخر وأرسل اي سؤال خاص بشركتنا وسيقوم المساعد الذكي بالرد عليك :*\n\n${optionsText}\n6️⃣ - سؤال آخر` });
        } else {
            const userState = respondedMessages.get(sender);

            if (userState === "انتظار_الاختيار") {
                const options = await loadOptions();
                const selectedOption = options.options.find(opt => opt.id === text.trim());

                if (selectedOption) {
                    await sock.sendMessage(sender, { text: selectedOption.response });
                    setTimeout(() => respondedMessages.delete(sender), 300000);
                } else if (text.trim() === "6") {
                    await sock.sendMessage(sender, { text: "✍️ *الرجاء كتابة سؤالك:*" });
                    respondedMessages.set(sender, "انتظار_السؤال");
                } else {
                    await sock.sendMessage(sender, { text: "⚠️ خيار غير صحيح، الرجاء اختيار رقم من القائمة." });
                }
            } else if (userState === "انتظار_السؤال") {
                const textContent = await readTextFile("file.txt");
                const response = await getGeminiResponse(text, textContent);
                await sock.sendMessage(sender, { text: response });
                setTimeout(() => respondedMessages.delete(sender), 300000);
            }
        }
    });
}

async function readTextFile(filePath) {
    try {
        const data = await fs.readFile(filePath, "utf8");
        return data;
    } catch (error) {
        console.error("❌ خطأ في قراءة الملف:", error);
        return "";
    }
}


const { GoogleGenerativeAI } = require("@google/generative-ai");


async function getGeminiResponse(userInput, context) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `من خلال المعلومات التالية، أعطني فقط الإجابة على السؤال بدون أي مقدمات:\n\nالنص:\n${context}\n\nالسؤال:\n${userInput}\n\nالإجابة:`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text();

        console.log("📩 استجابة Gemini AI:", response);
        return response.trim() || "⚠️ لم أفهم سؤالك، يرجى إعادة الصياغة.";
    } catch (error) {
        console.error("❌ خطأ أثناء الاتصال بـ Gemini AI:", error);
        return "⚠️ حدث خطأ أثناء الاتصال بالخدمة.";
    }
}
// إنشاء سيرفر يعرض QR Code على المتصفح
app.get("/", (req, res) => {
    res.send(global.qrCodeUrl
        ? `<h1>امسح رمز QR للاتصال بالبوت</h1><img src="${global.qrCodeUrl}" width="300">`
        : "<h1>لم يتم توليد رمز QR بعد... يرجى الانتظار!</h1>");
});

// API لإدارة الخيارات
app.get("/options", async (req, res) => {
    const options = await loadOptions();
    res.json(options);
});

app.post("/options", async (req, res) => {
    const newOption = req.body;
    const options = await loadOptions();
    options.options.push(newOption);
    await saveOptions(options);
    res.json({ success: true });
});

app.delete("/options/:id", async (req, res) => {
    const id = req.params.id;
    const options = await loadOptions();
    options.options = options.options.filter(opt => opt.id !== id);
    await saveOptions(options);
    res.json({ success: true });
});

app.listen(3000, () => console.log("🌍 افتح الرابط: http://localhost:3000"));

connectToWhatsApp();