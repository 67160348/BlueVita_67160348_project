const $ = (selector) => document.querySelector(selector);
const state = {
  products: [], cart: JSON.parse(localStorage.getItem("bluevita-cart") || "[]"),
  token: localStorage.getItem("bluevita-token") || "", user: JSON.parse(localStorage.getItem("bluevita-user") || "null"),
  authMode: "login", currentView: "home", currentProduct: null
};
const money = n => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(n);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
  return data;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}
function saveCart() { localStorage.setItem("bluevita-cart", JSON.stringify(state.cart)); updateCartCount(); }
function updateCartCount() { $("#cartCount").textContent = state.cart.reduce((sum, item) => sum + item.quantity, 0); }
function showView(name) {
  if (name === "admin" && state.user?.role !== "admin") name = "account";
  state.currentView = name;
  document.querySelectorAll(".view").forEach(el => el.hidden = el.id !== `${name}View`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "shop") renderShop();
  if (name === "cart") renderCart();
  if (name === "orders") renderOrders();
  if (name === "detail") renderProductDetail();
  if (name === "rewards") renderRewards();
  if (name === "admin") renderAdmin();
  if (name === "account") updateAccountUI();
}
function productCard(p) {
  const image = p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.style.display='none'">` : "";
  return `<article class="product-card">
    <button class="product-image product-open" data-detail="${escapeHtml(p.id)}" aria-label="อ่านรายละเอียด ${escapeHtml(p.name)}">${image}<span class="product-placeholder">✚</span><span class="image-view-label">ดูรายละเอียด ↗</span></button>
    <div class="product-info"><span class="product-category">${escapeHtml(p.category)}</span>
    <button class="product-title-link" data-detail="${escapeHtml(p.id)}"><h3>${escapeHtml(p.name)}</h3></button>
    <p>${escapeHtml(p.description)}</p><div class="product-bottom"><span class="price">${money(p.price)}</span><button class="add-button" data-add="${escapeHtml(p.id)}" aria-label="เพิ่ม ${escapeHtml(p.name)} ลงตะกร้า" ${p.stock < 1 ? "disabled" : ""}>${p.stock < 1 ? "หมด" : "＋"}</button></div><small class="stock-note">${p.stock > 0 ? `พร้อมส่ง · เหลือ ${p.stock} ชิ้น` : "สินค้าหมดชั่วคราว"}</small>
    <button class="detail-link" data-detail="${escapeHtml(p.id)}">รายละเอียดและรีวิว <span>→</span></button></div></article>`;
}
async function loadProducts() {
  state.products = await api("/products");
  $("#featuredProducts").innerHTML = state.products.filter(p => p.featured).map(productCard).join("") || '<div class="empty-state">ยังไม่มีสินค้าแนะนำ</div>';
  renderShop();
}
function renderShop() {
  if (!state.products.length) return;
  const q = ($("#searchInput")?.value || "").trim().toLowerCase();
  const category = $("#categoryFilter")?.value || "ทั้งหมด";
  const sort = $("#sortFilter")?.value || "default";
  let list = state.products.filter(p => (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q)) && (category === "ทั้งหมด" || p.category === category));
  if (sort === "low") list.sort((a,b) => a.price-b.price);
  if (sort === "high") list.sort((a,b) => b.price-a.price);
  $("#allProducts").innerHTML = list.length ? list.map(productCard).join("") : '<div class="empty-state">ไม่พบสินค้าที่ค้นหา ลองใช้คำอื่นดูนะ</div>';
}
async function renderProductDetail() {
  const p = state.products.find(item => item.id === state.currentProduct);
  const target = $("#productDetail");
  if (!p) { target.innerHTML = '<div class="empty-state">ไม่พบสินค้า <button class="button button-primary" data-view="shop">กลับไปเลือกสินค้า</button></div>'; return; }
  target.innerHTML = `<button class="back-link" data-view="shop">← กลับไปสินค้าทั้งหมด</button>
    <div class="detail-layout"><div class="detail-image">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none'">` : ""}<span class="detail-image-mark">✚</span></div>
    <div class="detail-copy"><span class="product-category">${escapeHtml(p.category)}</span><h1>${escapeHtml(p.name)}</h1><div class="detail-price">${money(p.price)}</div><p class="detail-description">${escapeHtml(p.description)}</p>
    <div class="detail-facts"><div><span>สถานะ</span><b>${p.stock > 0 ? "มีสินค้า" : "สินค้าหมด"}</b></div><div><span>คงเหลือ</span><b>${p.stock} ชิ้น</b></div><div><span>รีวิว</span><b id="reviewCount">กำลังโหลด…</b></div></div>
    <button class="button button-primary detail-add" data-add="${escapeHtml(p.id)}" ${p.stock < 1 ? "disabled" : ""}>เพิ่มลงตะกร้า · ${money(p.price)}</button>
    <div class="info-box"><h3>📋 ข้อมูลที่ควรอ่านก่อนใช้</h3><p><b>ส่วนประกอบและปริมาณ:</b> โปรดตรวจสอบจากฉลากสินค้าจริง ข้อมูลนี้เป็นหน้าร้านตัวอย่างและยังไม่มีเอกสารยืนยันส่วนประกอบเฉพาะรุ่น</p><p><b>วิธีใช้:</b> ปฏิบัติตามคำแนะนำบนฉลากผลิตภัณฑ์เท่านั้น ไม่ควรเดาปริมาณรับประทานจากชื่อสินค้า</p><p><b>ข้อควรระวัง:</b> หากตั้งครรภ์ มีโรคประจำตัว แพ้อาหาร หรือใช้ยาประจำ ควรปรึกษาแพทย์หรือเภสัชกรก่อนใช้</p></div>
    </div></div><section class="reviews-section"><div class="section-heading"><div><span class="eyebrow">COMMUNITY NOTES</span><h2>รีวิวจากผู้ซื้อ</h2></div></div><div id="productReviews" class="review-list"><p>กำลังโหลดรีวิว…</p></div></section>`;
  try {
    const reviews = await api(`/products/${encodeURIComponent(p.id)}/reviews`);
    $("#reviewCount").textContent = `${reviews.length} รีวิว`;
    $("#productReviews").innerHTML = reviews.length ? reviews.map(r => `<article class="review-card"><div class="review-card-head"><b>${escapeHtml(r.name)}</b><span>${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</span></div><p>${escapeHtml(r.comment)}</p><small>${new Date(r.createdAt).toLocaleDateString("th-TH")}</small></article>`).join("") : '<div class="empty-state compact">ยังไม่มีรีวิวแรกของสินค้านี้</div>';
  } catch { $("#productReviews").innerHTML = '<p class="muted">ยังโหลดรีวิวไม่ได้ในขณะนี้</p>'; }
}
async function renderRewards() {
  const el = $("#rewardsContent");
  if (!state.user) { el.innerHTML = '<div class="empty-state"><h3>เข้าสู่ระบบเพื่อดูคะแนน</h3><button class="button button-primary" data-view="account">เข้าสู่ระบบ / สมัครสมาชิก</button></div>'; return; }
  try {
    const data = await api("/rewards");
    el.innerHTML = `<div class="points-banner"><div><span>คะแนนสะสมของคุณ</span><strong>${data.points} <small>คะแนน</small></strong><p>รีวิวสินค้าที่ซื้อและจัดส่งแล้ว รับ 1 คะแนนต่อสินค้า 1 รายการ (รีวิวซ้ำไม่ได้)</p></div><span class="points-icon">✦</span></div>
    <h2 class="subheading">รายการที่รีวิวได้</h2>${data.eligible.length ? data.eligible.map(item => `<article class="review-eligible"><div><b>${escapeHtml(item.productName)}</b><small>คำสั่งซื้อ ${escapeHtml(item.orderId)} · จัดส่งแล้ว</small></div><form class="review-form" data-review-order="${escapeHtml(item.orderId)}" data-review-product="${escapeHtml(item.productId)}"><label>ให้คะแนน<select name="rating"><option value="5">★★★★★ ดีมาก</option><option value="4">★★★★☆ ดี</option><option value="3">★★★☆☆ ปานกลาง</option><option value="2">★★☆☆☆ พอใช้</option><option value="1">★☆☆☆☆ ควรปรับปรุง</option></select></label><label>รีวิว<textarea name="comment" minlength="3" maxlength="500" required placeholder="เล่าประสบการณ์การซื้อของคุณ (3–500 ตัวอักษร)"></textarea></label><button class="button button-primary" type="submit">ส่งรีวิว รับ 1 คะแนน</button></form></article>`).join("") : '<div class="empty-state compact">ยังไม่มีรายการที่รีวิวได้ ต้องเป็นสินค้าที่ซื้อและมีสถานะจัดส่งแล้วเท่านั้น</div>'}`;
  } catch (e) { el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; }
}
function addToCart(id) {
  const p = state.products.find(item => item.id === id); if (!p) return;
  const existing = state.cart.find(item => item.id === id);
  if ((existing?.quantity || 0) >= p.stock) return toast("สินค้าในสต็อกมีไม่พอ");
  if (existing) existing.quantity++; else state.cart.push({ id, quantity: 1 });
  saveCart(); toast("เพิ่มสินค้าลงตะกร้าแล้ว");
}
function cartRows() {
  return state.cart.map(item => {
    const p = state.products.find(product => product.id === item.id);
    if (!p) return "";
    return `<div class="cart-row"><div><b>${escapeHtml(p.name)}</b><small>${money(p.price)} / ชิ้น</small></div><div class="qty-control"><button data-qty="${p.id}" data-delta="-1" aria-label="ลดจำนวน">−</button><span>${item.quantity}</span><button data-qty="${p.id}" data-delta="1" aria-label="เพิ่มจำนวน" ${item.quantity >= p.stock ? "disabled" : ""}>+</button><button class="danger-button" data-remove="${p.id}">ลบ</button></div><span class="price">${money(p.price * item.quantity)}</span></div>`;
  }).join("");
}
function renderCart() {
  const content = $("#cartContent");
  const validItems = state.cart.filter(item => state.products.some(p => p.id === item.id));
  state.cart = validItems; saveCart();
  if (!validItems.length) { content.innerHTML = '<div class="empty-state"><div style="font-size:42px">🛒</div><h3>ตะกร้ายังว่างอยู่</h3><p>เลือกสินค้าที่สนใจ แล้วกลับมาสั่งซื้อได้ที่นี่</p><button class="button button-primary" data-view="shop">เลือกชมสินค้า</button></div>'; return; }
  const total = validItems.reduce((sum, item) => sum + state.products.find(p => p.id === item.id).price * item.quantity, 0);
  content.innerHTML = `<div class="cart-layout"><div class="cart-list">${cartRows()}</div><div class="summary-card"><h3>สรุปคำสั่งซื้อ</h3><div class="summary-line"><span>จำนวนสินค้า</span><span>${validItems.reduce((s,i)=>s+i.quantity,0)} ชิ้น</span></div><div class="summary-line"><span>ค่าจัดส่ง</span><span>คำนวณภายหลัง</span></div><div class="summary-line summary-total"><span>รวมสินค้า</span><span>${money(total)}</span></div><form id="checkoutForm" class="checkout-form"><h3>ข้อมูลจัดส่ง</h3><label>ชื่อผู้รับ<input name="shippingName" required></label><label>เบอร์โทรศัพท์<input name="phone" type="tel" required></label><label>ที่อยู่จัดส่ง<textarea name="address" rows="3" required></textarea></label><button class="button button-primary full" type="submit">ยืนยันคำสั่งซื้อ</button><small style="color:#7b8da0">เดโมนี้ยังไม่เชื่อมระบบชำระเงินจริง</small></form></div></div>`;
}
async function checkout(form) {
  if (!state.user) { toast("เข้าสู่ระบบก่อนสั่งซื้อนะ"); showView("account"); return; }
  const fd = new FormData(form);
  try {
    const result = await api("/orders", { method:"POST", body:JSON.stringify({ items:state.cart, shippingName:fd.get("shippingName"), phone:fd.get("phone"), address:fd.get("address") }) });
    state.cart = []; saveCart(); await loadProducts(); toast(`สั่งซื้อสำเร็จ เลขที่ ${result.order.id}`); showView("orders");
  } catch (e) { toast(e.message); }
}
function updateAccountUI() {
  const signedIn = Boolean(state.user);
  $("#accountButton").textContent = signedIn ? state.user.name : "เข้าสู่ระบบ";
  $("#adminNav").hidden = state.user?.role !== "admin";
  $("#logoutButton").hidden = !signedIn;
  $("#authForm").hidden = signedIn;
  if (signedIn) $("#authMessage").textContent = `เข้าสู่ระบบแล้ว: ${state.user.name} (${state.user.role === "admin" ? "แอดมิน" : "สมาชิก"})`;
  else $("#authMessage").textContent = "";
}
function setAuthMode(mode) {
  state.authMode = mode;
  $("#loginTab").classList.toggle("active", mode === "login");
  $("#registerTab").classList.toggle("active", mode === "register");
  $("#nameLabel").hidden = mode !== "register";
  $("#authName").required = mode === "register";
  $("#authSubmit").textContent = mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
  $("#authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#authMessage").textContent = "";
}
async function submitAuth(form) {
  const payload = { email: $("#authEmail").value, password: $("#authPassword").value };
  if (state.authMode === "register") payload.name = $("#authName").value;
  try {
    const result = await api(`/auth/${state.authMode === "login" ? "login" : "register"}`, { method:"POST", body:JSON.stringify(payload) });
    state.token = result.token; state.user = result.user;
    localStorage.setItem("bluevita-token", state.token); localStorage.setItem("bluevita-user", JSON.stringify(state.user));
    form.reset(); updateAccountUI(); toast("เข้าสู่ระบบสำเร็จ"); showView("home");
  } catch (e) { $("#authMessage").textContent = e.message; }
}
function logout() {
  state.token = ""; state.user = null;
  localStorage.removeItem("bluevita-token"); localStorage.removeItem("bluevita-user");
  updateAccountUI(); toast("ออกจากระบบแล้ว"); showView("home");
}
async function renderOrders() {
  if (!state.user) { $("#ordersContent").innerHTML = '<div class="empty-state"><h3>เข้าสู่ระบบเพื่อดูคำสั่งซื้อ</h3><button class="button button-primary" data-view="account">เข้าสู่ระบบ</button></div>'; return; }
  try {
    const orders = await api("/orders/mine");
    $("#ordersContent").innerHTML = orders.length ? orders.map(o => `<article class="order-card"><div class="order-head"><b>${escapeHtml(o.id)}</b><span class="status-pill">${escapeHtml(o.status)}</span></div><p>${new Date(o.createdAt).toLocaleString("th-TH")} · ${o.items.map(i => `${escapeHtml(i.name)} × ${i.quantity}`).join(", ")}</p><b>ยอดรวม ${money(o.total)}</b></article>`).join("") : '<div class="empty-state"><h3>ยังไม่มีคำสั่งซื้อ</h3><p>เมื่อคุณสั่งซื้อ รายการจะแสดงที่หน้านี้</p><button class="button button-primary" data-view="shop">เลือกชมสินค้า</button></div>';
  } catch (e) { $("#ordersContent").innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; }
}
async function renderAdmin() {
  if (state.user?.role !== "admin") return showView("account");
  $("#adminProducts").innerHTML = state.products.map(p => `<div class="admin-item"><div><b>${escapeHtml(p.name)}</b><small>${money(p.price)} · คงเหลือ ${p.stock}</small></div><button class="danger-button" data-delete-product="${p.id}">ลบ</button></div>`).join("");
  try {
    const orders = await api("/admin/orders");
    $("#adminOrders").innerHTML = orders.length ? orders.map(o => `<div class="admin-order"><b>${escapeHtml(o.id)}</b> · ${money(o.total)}<small>${escapeHtml(o.shippingName)} · ${escapeHtml(o.phone)}</small><select data-order-status="${o.id}">${["รอดำเนินการ","กำลังจัดส่ง","จัดส่งแล้ว","ยกเลิก"].map(s => `<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></div>`).join("") : "<p>ยังไม่มีคำสั่งซื้อ</p>";
  } catch (e) { $("#adminOrders").innerHTML = `<p>${escapeHtml(e.message)}</p>`; }
}
document.addEventListener("click", async event => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) { event.preventDefault(); showView(view); return; }
  const category = event.target.closest("[data-category]")?.dataset.category;
  if (category) { showView("shop"); $("#categoryFilter").value = category; renderShop(); return; }
  const detail = event.target.closest("[data-detail]")?.dataset.detail; if (detail) { state.currentProduct = detail; showView("detail"); return; }
  const add = event.target.closest("[data-add]")?.dataset.add; if (add) return addToCart(add);
  const qty = event.target.closest("[data-qty]");
  if (qty) {
    const item = state.cart.find(i => i.id === qty.dataset.qty); const product = state.products.find(p => p.id === qty.dataset.qty);
    if (item && product) { item.quantity += Number(qty.dataset.delta); if (item.quantity <= 0) state.cart = state.cart.filter(i => i.id !== item.id); if (item.quantity > product.stock) item.quantity = product.stock; saveCart(); renderCart(); }
    return;
  }
  const remove = event.target.closest("[data-remove]")?.dataset.remove;
  if (remove) { state.cart = state.cart.filter(i => i.id !== remove); saveCart(); renderCart(); return; }
  const del = event.target.closest("[data-delete-product]")?.dataset.deleteProduct;
  if (del && confirm("ต้องการลบสินค้านี้หรือไม่?")) {
    try { await api(`/admin/products/${del}`, { method:"DELETE" }); await loadProducts(); renderAdmin(); toast("ลบสินค้าแล้ว"); } catch(e) { toast(e.message); }
  }
});
document.addEventListener("change", async event => {
  if (event.target.matches("#searchInput,#categoryFilter,#sortFilter")) renderShop();
  const orderId = event.target.dataset.orderStatus;
  if (orderId) {
    try { await api(`/admin/orders/${orderId}`, { method:"PATCH", body:JSON.stringify({ status:event.target.value }) }); toast("อัปเดตสถานะแล้ว"); }
    catch(e) { toast(e.message); }
  }
});
document.addEventListener("submit", async event => {
  if (event.target.id === "authForm") { event.preventDefault(); await submitAuth(event.target); }
  if (event.target.matches(".review-form")) {
    event.preventDefault();
    const form = event.target, fd = new FormData(form);
    try { await api("/reviews", { method:"POST", body:JSON.stringify({ orderId:form.dataset.reviewOrder, productId:form.dataset.reviewProduct, rating:Number(fd.get("rating")), comment:fd.get("comment") }) }); toast("ส่งรีวิวสำเร็จ! ได้รับ 1 คะแนน 🎉"); await renderRewards(); }
    catch(e) { toast(e.message); }
  }
  if (event.target.id === "checkoutForm") { event.preventDefault(); await checkout(event.target); }
  if (event.target.id === "productForm") {
    event.preventDefault();
    const fd = new FormData(event.target);
    const product = Object.fromEntries(fd.entries()); product.featured = fd.has("featured");
    try { await api("/admin/products", { method:"POST", body:JSON.stringify(product) }); event.target.reset(); $("#productMessage").textContent = "เพิ่มสินค้าแล้ว"; await loadProducts(); renderAdmin(); toast("เพิ่มสินค้าแล้ว"); }
    catch(e) { $("#productMessage").textContent = e.message; }
  }
});
$("#loginTab").addEventListener("click", () => setAuthMode("login"));
$("#registerTab").addEventListener("click", () => setAuthMode("register"));
$("#logoutButton").addEventListener("click", logout);
$("#searchInput").addEventListener("input", renderShop);
(async function init() {
  updateCartCount(); updateAccountUI(); setAuthMode("login");
  try {
    if (state.token) {
      const result = await api("/auth/me"); state.user = result.user; localStorage.setItem("bluevita-user", JSON.stringify(state.user));
    }
  } catch { state.token = ""; state.user = null; localStorage.removeItem("bluevita-token"); localStorage.removeItem("bluevita-user"); }
  try { await loadProducts(); } catch (e) { $("#featuredProducts").innerHTML = `<div class="empty-state">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ${escapeHtml(e.message)}</div>`; }
  updateAccountUI();
})();
