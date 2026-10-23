require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, points: Number(user.points || 0) };
}
function makeToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: "8h" });
}
function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    try {
      if (!token) throw new Error("Missing token");
      req.user = jwt.verify(token, JWT_SECRET);
      if (requiredRole && req.user.role !== requiredRole) {
        return res.status(403).json({ error: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้" });
      }
      next();
    } catch {
      return res.status(401).json({ error: "กรุณาเข้าสู่ระบบใหม่" });
    }
  };
}

// Demo setup: creates an admin account on first run. Change the password before real deployment.
function ensureAdmin() {
  const users = readJson(USERS_FILE, []);
  const email = (process.env.ADMIN_EMAIL || "admin@bluevita.local").toLowerCase();
  if (!users.some(u => u.email === email)) {
    const password = process.env.ADMIN_PASSWORD || "ChangeThisPassword123!";
    users.push({
      id: "admin-001", name: "BlueVita Admin", email,
      passwordHash: bcrypt.hashSync(password, 10), role: "admin"
    });
    writeJson(USERS_FILE, users);
    console.log(`Demo admin created: ${email}`);
    if (!process.env.ADMIN_PASSWORD) console.log("Demo password: ChangeThisPassword123! (change before deployment)");
  }
}
ensureAdmin();

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/products/:id/reviews", (req, res) => {
  const reviews = readJson(REVIEWS_FILE, []).filter(r => r.productId === req.params.id);
  res.json(reviews.map(r => ({ name: r.name, rating: r.rating, comment: r.comment, createdAt: r.createdAt })));
});

app.get("/api/rewards", auth(), (req, res) => {
  const orders = readJson(ORDERS_FILE, []).filter(o => o.userId === req.user.id && o.status === "จัดส่งแล้ว");
  const reviews = readJson(REVIEWS_FILE, []);
  const eligible = [];
  for (const order of orders) for (const item of order.items) {
    if (!reviews.some(r => r.userId === req.user.id && r.orderId === order.id && r.productId === item.id)) {
      eligible.push({ orderId: order.id, productId: item.id, productName: item.name });
    }
  }
  const user = readJson(USERS_FILE, []).find(u => u.id === req.user.id);
  res.json({ points: Number(user?.points || 0), eligible });
});

app.post("/api/reviews", auth(), (req, res) => {
  const { orderId, productId, rating, comment } = req.body || {};
  if (!orderId || !productId || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 || typeof comment !== "string" || comment.trim().length < 3 || comment.trim().length > 500) {
    return res.status(400).json({ error: "กรุณาให้คะแนน 1–5 และเขียนรีวิว 3–500 ตัวอักษร" });
  }
  const orders = readJson(ORDERS_FILE, []);
  const order = orders.find(o => o.id === orderId && o.userId === req.user.id && o.status === "จัดส่งแล้ว");
  if (!order || !order.items.some(i => i.id === productId)) return res.status(403).json({ error: "รีวิวได้เฉพาะสินค้าที่ซื้อและจัดส่งแล้วเท่านั้น" });
  const reviews = readJson(REVIEWS_FILE, []);
  if (reviews.some(r => r.userId === req.user.id && r.orderId === orderId && r.productId === productId)) {
    return res.status(409).json({ error: "คุณรีวิวสินค้านี้ในคำสั่งซื้อนี้แล้ว" });
  }
  const user = readJson(USERS_FILE, []);
  const account = user.find(u => u.id === req.user.id);
  if (!account) return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });
  const product = readJson(PRODUCTS_FILE, []).find(p => p.id === productId);
  reviews.unshift({ id: `review-${Date.now()}`, userId: account.id, name: account.name, orderId, productId, productName: product?.name || "", rating: Number(rating), comment: comment.trim(), createdAt: new Date().toISOString() });
  account.points = Number(account.points || 0) + 1;
  writeJson(REVIEWS_FILE, reviews); writeJson(USERS_FILE, user);
  res.status(201).json({ message: "ขอบคุณสำหรับรีวิว", points: account.points });
});



app.get("/api/products", (req, res) => {
  let products = readJson(PRODUCTS_FILE, []);
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim();
  if (q) products = products.filter(p =>
    `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q));
  if (category && category !== "ทั้งหมด") products = products.filter(p => p.category === category);
  res.json(products);
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "กรอกชื่อ อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษร" });
  }
  const users = readJson(USERS_FILE, []);
  const normalizedEmail = String(email).trim().toLowerCase();
  if (users.some(u => u.email === normalizedEmail)) {
    return res.status(409).json({ error: "อีเมลนี้มีบัญชีแล้ว" });
  }
  const user = {
    id: `user-${Date.now()}`, name: String(name).trim(), email: normalizedEmail,
    passwordHash: bcrypt.hashSync(password, 10), role: "customer"
  };
  users.push(user);
  writeJson(USERS_FILE, users);
  res.status(201).json({ token: makeToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const users = readJson(USERS_FILE, []);
  const user = users.find(u => u.email === String(email || "").trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ""), user.passwordHash)) {
    return res.status(401).json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
  }
  res.json({ token: makeToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", auth(), (req, res) => {
  const user = readJson(USERS_FILE, []).find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });
  res.json({ user: publicUser(user) });
});

app.post("/api/orders", auth(), (req, res) => {
  const { items, shippingName, phone, address } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || !shippingName || !phone || !address) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลจัดส่งและสินค้าให้ครบ" });
  }
  const products = readJson(PRODUCTS_FILE, []);
  const orderItems = [];
  for (const item of items) {
    const product = products.find(p => p.id === item.id);
    const qty = Number(item.quantity);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: "ข้อมูลสินค้าในตะกร้าไม่ถูกต้อง" });
    }
    if (product.stock < qty) return res.status(400).json({ error: `สินค้า ${product.name} มีไม่พอ` });
    orderItems.push({ id: product.id, name: product.name, price: product.price, quantity: qty });
  }
  for (const item of orderItems) {
    const product = products.find(p => p.id === item.id);
    product.stock -= item.quantity;
  }
  writeJson(PRODUCTS_FILE, products);
  const orders = readJson(ORDERS_FILE, []);
  const order = {
    id: `BV-${Date.now()}`, userId: req.user.id, items: orderItems,
    total: orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    shippingName: String(shippingName), phone: String(phone), address: String(address),
    status: "รอดำเนินการ", createdAt: new Date().toISOString()
  };
  orders.unshift(order);
  writeJson(ORDERS_FILE, orders);
  res.status(201).json({ message: "สร้างคำสั่งซื้อแล้ว (เดโม)", order });
});

app.get("/api/orders/mine", auth(), (req, res) => {
  res.json(readJson(ORDERS_FILE, []).filter(o => o.userId === req.user.id));
});

app.get("/api/admin/orders", auth("admin"), (_req, res) => {
  res.json(readJson(ORDERS_FILE, []));
});

app.patch("/api/admin/orders/:id", auth("admin"), (req, res) => {
  const allowed = ["รอดำเนินการ", "กำลังจัดส่ง", "จัดส่งแล้ว", "ยกเลิก"];
  const { status } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
  const orders = readJson(ORDERS_FILE, []);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "ไม่พบคำสั่งซื้อ" });
  order.status = status;
  writeJson(ORDERS_FILE, orders);
  res.json({ order });
});

app.post("/api/admin/products", auth("admin"), (req, res) => {
  const { name, category, price, description, image, stock, featured } = req.body || {};
  if (!name || !category || !Number.isFinite(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ error: "กรอกชื่อ หมวดหมู่ และราคาที่ถูกต้อง" });
  }
  const products = readJson(PRODUCTS_FILE, []);
  const product = {
    id: `p-${Date.now()}`, name: String(name), category: String(category),
    price: Number(price), description: String(description || ""),
    image: String(image || ""), stock: Math.max(0, Number(stock) || 0), featured: Boolean(featured)
  };
  products.push(product);
  writeJson(PRODUCTS_FILE, products);
  res.status(201).json(product);
});

app.delete("/api/admin/products/:id", auth("admin"), (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const next = products.filter(p => p.id !== req.params.id);
  if (next.length === products.length) return res.status(404).json({ error: "ไม่พบสินค้า" });
  writeJson(PRODUCTS_FILE, next);
  res.json({ message: "ลบสินค้าแล้ว" });
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`BlueVita running at http://localhost:${PORT}`));
