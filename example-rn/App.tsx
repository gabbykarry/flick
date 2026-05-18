import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  rating: string;
}

interface CartItem extends Product {
  qty: number;
}

const PRODUCTS: Product[] = [
  {
    id: "1",
    name: "Air Runner Pro",
    price: 129,
    category: "Fashion",
    emoji: "👟",
    rating: "4.9",
  },
  {
    id: "2",
    name: "Wireless Headphones",
    price: 89,
    category: "Electronics",
    emoji: "🎧",
    rating: "4.8",
  },
  {
    id: "3",
    name: "Leather Wallet",
    price: 49,
    category: "Accessories",
    emoji: "👜",
    rating: "4.7",
  },
  {
    id: "4",
    name: "Smart Watch Series 3",
    price: 199,
    category: "Electronics",
    emoji: "⌚",
    rating: "4.9",
  },
  {
    id: "5",
    name: "Canvas Backpack",
    price: 79,
    category: "Fashion",
    emoji: "🎒",
    rating: "4.5",
  },
  {
    id: "6",
    name: "Sunglasses Retro",
    price: 59,
    category: "Accessories",
    emoji: "🕶️",
    rating: "4.7",
  },
];

type Screen = "home" | "shop" | "cart" | "account" | "dashboard";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing)
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i,
        );
      return [...prev, { ...product, qty: 1 }];
    });
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setLoginError("Please enter email and password");
      return;
    }
    setLoginError("");
    setLoggedIn(true);
    setScreen("dashboard");
  }

  function handleLogout() {
    setLoggedIn(false);
    setEmail("");
    setPassword("");
    setScreen("account");
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  function renderHome() {
    return (
      <ScrollView testID="home-screen" style={s.screen}>
        <View testID="hero-banner" style={s.hero}>
          <Text style={s.heroEmoji}>🛍️</Text>
          <Text style={s.heroTitle}>Flick Store</Text>
          <Text style={s.heroSub}>Premium products, zero compromise</Text>
          <TouchableOpacity
            testID="shop-now-btn"
            style={s.heroBtnPrimary}
            onPress={() => setScreen("shop")}
          >
            <Text style={s.heroBtnText}>Shop now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="sign-in-btn"
            style={s.heroBtnSecondary}
            onPress={() => setScreen("account")}
          >
            <Text style={s.heroBtnTextSecondary}>Sign in</Text>
          </TouchableOpacity>
        </View>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Featured products</Text>
          {PRODUCTS.slice(0, 3).map((p) => (
            <View
              testID={`product-card-${p.id}`}
              key={p.id}
              style={s.productRow}
            >
              <Text style={s.productEmoji}>{p.emoji}</Text>
              <View style={s.productInfo}>
                <Text style={s.productName}>{p.name}</Text>
                <Text style={s.productPrice}>${p.price}</Text>
              </View>
              <TouchableOpacity
                testID={`add-to-cart-${p.id}`}
                style={s.addBtn}
                onPress={() => addToCart(p)}
              >
                <Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderShop() {
    return (
      <ScrollView testID="shop-screen" style={s.screen}>
        <Text style={s.pageTitle}>All Products</Text>
        {PRODUCTS.map((p) => (
          <View
            testID={`shop-product-${p.id}`}
            key={p.id}
            style={s.productCard}
          >
            <View style={s.productCardTop}>
              <Text style={s.productCardEmoji}>{p.emoji}</Text>
              <View style={s.productCardInfo}>
                <Text style={s.productCardCat}>{p.category}</Text>
                <Text style={s.productCardName}>{p.name}</Text>
                <Text style={s.productCardRating}>★ {p.rating}</Text>
              </View>
            </View>
            <View style={s.productCardBottom}>
              <Text style={s.productCardPrice}>${p.price}</Text>
              <TouchableOpacity
                testID={`shop-add-${p.id}`}
                style={s.addBtn}
                onPress={() => addToCart(p)}
              >
                <Text style={s.addBtnText}>Add to cart</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  function renderCart() {
    return (
      <ScrollView testID="cart-screen" style={s.screen}>
        <Text style={s.pageTitle}>Cart ({cartCount})</Text>
        {cart.length === 0 ? (
          <View testID="cart-empty" style={s.emptyState}>
            <Text style={s.emptyEmoji}>🛒</Text>
            <Text style={s.emptyText}>Your cart is empty</Text>
            <TouchableOpacity
              testID="go-shop-btn"
              style={s.heroBtnPrimary}
              onPress={() => setScreen("shop")}
            >
              <Text style={s.heroBtnText}>Browse products</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {cart.map((item) => (
              <View
                testID={`cart-item-${item.id}`}
                key={item.id}
                style={s.cartItem}
              >
                <Text style={s.cartEmoji}>{item.emoji}</Text>
                <View style={s.cartInfo}>
                  <Text style={s.cartName}>{item.name}</Text>
                  <Text style={s.cartQty}>Qty: {item.qty}</Text>
                </View>
                <Text style={s.cartPrice}>${item.price * item.qty}</Text>
                <TouchableOpacity
                  testID={`remove-cart-${item.id}`}
                  onPress={() => removeFromCart(item.id)}
                >
                  <Text style={s.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View testID="cart-total" style={s.cartTotalRow}>
              <Text style={s.cartTotalLabel}>Total</Text>
              <Text style={s.cartTotalValue}>${cartTotal}</Text>
            </View>
            <TouchableOpacity
              testID="checkout-btn"
              style={s.heroBtnPrimary}
              onPress={() =>
                Alert.alert("Order placed!", "Thanks for your purchase 🎉")
              }
            >
              <Text style={s.heroBtnText}>Checkout</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  function renderAccount() {
    return (
      <ScrollView testID="account-screen" style={s.screen}>
        <Text style={s.pageTitle}>Sign in</Text>
        <View style={s.authCard}>
          <Text style={s.inputLabel}>Email</Text>
          <TextInput
            testID="email-input"
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor="#888"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
          />
          <Text style={s.inputLabel}>Password</Text>
          <TextInput
            testID="password-input"
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor="#888"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          {loginError ? (
            <Text testID="login-error" style={s.errorText}>
              {loginError}
            </Text>
          ) : null}
          <TouchableOpacity
            testID="login-btn"
            style={s.heroBtnPrimary}
            onPress={handleLogin}
          >
            <Text style={s.heroBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  function renderDashboard() {
    return (
      <ScrollView testID="dashboard-screen" style={s.screen}>
        <Text testID="dashboard-header" style={s.pageTitle}>
          My Account
        </Text>
        <View testID="welcome-card" style={s.welcomeCard}>
          <Text style={s.welcomeEmoji}>👋</Text>
          <View>
            <Text style={s.welcomeName}>Welcome back!</Text>
            <Text style={s.welcomeEmail}>{email}</Text>
          </View>
        </View>
        <View style={s.statsRow}>
          <View testID="stat-orders" style={s.statCard}>
            <Text style={s.statValue}>3</Text>
            <Text style={s.statLabel}>Orders</Text>
          </View>
          <View testID="stat-spent" style={s.statCard}>
            <Text style={s.statValue}>$418</Text>
            <Text style={s.statLabel}>Spent</Text>
          </View>
          <View testID="stat-tier" style={s.statCard}>
            <Text style={s.statValue}>Gold</Text>
            <Text style={s.statLabel}>Tier</Text>
          </View>
        </View>
        <Text style={s.sectionTitle}>Recent orders</Text>
        {[
          {
            id: "FL-1042",
            name: "iPhone Case Midnight",
            status: "In Transit",
            emoji: "📱",
            amount: "$29",
          },
          {
            id: "FL-1038",
            name: "Air Runner Pro",
            status: "Delivered",
            emoji: "👟",
            amount: "$129",
          },
          {
            id: "FL-1021",
            name: "Wireless Headphones",
            status: "Delivered",
            emoji: "🎧",
            amount: "$89",
          },
        ].map((order) => (
          <View testID={`order-${order.id}`} key={order.id} style={s.orderRow}>
            <Text style={s.orderEmoji}>{order.emoji}</Text>
            <View style={s.orderInfo}>
              <Text style={s.orderName}>{order.name}</Text>
              <Text style={s.orderId}>#{order.id}</Text>
            </View>
            <Text style={s.orderAmount}>{order.amount}</Text>
            <View
              style={[
                s.statusBadge,
                order.status === "Delivered" ? s.statusGreen : s.statusAmber,
              ]}
            >
              <Text style={s.statusText}>{order.status}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity
          testID="logout-btn"
          style={s.logoutBtn}
          onPress={handleLogout}
        >
          <Text style={s.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────────

  const tabs = [
    { id: "home" as Screen, label: "Home", emoji: "🏠", testID: "tab-home" },
    { id: "shop" as Screen, label: "Shop", emoji: "🛍️", testID: "tab-shop" },
    { id: "cart" as Screen, label: "Cart", emoji: "🛒", testID: "tab-cart" },
    {
      id: "account" as Screen,
      label: "Account",
      emoji: "👤",
      testID: "tab-account",
    },
  ];

  return (
    <SafeAreaView testID="app-root" style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />
      <View testID="app-header" style={s.header}>
        <Text style={s.headerLogo}>⚡ FLICK STORE</Text>
        {cartCount > 0 && (
          <TouchableOpacity
            testID="cart-badge"
            onPress={() => setScreen("cart")}
          >
            <Text style={s.cartBadge}>🛒 {cartCount}</Text>
          </TouchableOpacity>
        )}
      </View>

      {screen === "home" && renderHome()}
      {screen === "shop" && renderShop()}
      {screen === "cart" && renderCart()}
      {screen === "account" && renderAccount()}
      {screen === "dashboard" && renderDashboard()}

      <View testID="tab-bar" style={s.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            testID={tab.testID}
            key={tab.id}
            style={s.tab}
            onPress={() => {
              if (tab.id === "account" && loggedIn) {
                setScreen("dashboard");
              } else {
                setScreen(tab.id);
              }
            }}
          >
            <Text style={s.tabEmoji}>{tab.emoji}</Text>
            <Text
              style={[
                s.tabLabel,
                (screen === tab.id ||
                  (tab.id === "account" && screen === "dashboard")) &&
                  s.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  headerLogo: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  cartBadge: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    backgroundColor: "#2563eb",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  screen: { flex: 1, backgroundColor: "#111" },
  pageTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    padding: 20,
    paddingBottom: 12,
  },
  hero: {
    backgroundColor: "#1a1a2e",
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  heroEmoji: { fontSize: 64 },
  heroTitle: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
  },
  heroSub: {
    color: "#aaa",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 8,
  },
  heroBtnPrimary: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 4,
  },
  heroBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  heroBtnSecondary: {
    backgroundColor: "#ffffff15",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    alignSelf: "stretch",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff30",
  },
  heroBtnTextSecondary: { color: "#fff", fontSize: 15, fontWeight: "600" },
  section: { padding: 20, gap: 12 },
  sectionTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  productEmoji: { fontSize: 32, width: 48, textAlign: "center" },
  productInfo: { flex: 1 },
  productName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  productPrice: {
    color: "#60a5fa",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  productCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    margin: 12,
    marginBottom: 0,
    padding: 16,
    borderWidth: 1,
    borderColor: "#222",
  },
  productCardTop: { flexDirection: "row", gap: 14, marginBottom: 12 },
  productCardEmoji: {
    fontSize: 40,
    width: 56,
    height: 56,
    backgroundColor: "#222",
    borderRadius: 10,
    textAlign: "center",
    textAlignVertical: "center",
  },
  productCardInfo: { flex: 1 },
  productCardCat: {
    color: "#666",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  productCardName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  productCardRating: { color: "#f59e0b", fontSize: 12, marginTop: 2 },
  productCardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  productCardPrice: { color: "#fff", fontSize: 22, fontWeight: "900" },
  addBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    margin: 12,
    marginBottom: 0,
    padding: 14,
    gap: 10,
  },
  cartEmoji: { fontSize: 28 },
  cartInfo: { flex: 1 },
  cartName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  cartQty: { color: "#666", fontSize: 12, marginTop: 2 },
  cartPrice: { color: "#fff", fontSize: 16, fontWeight: "800" },
  removeBtn: { color: "#666", fontSize: 18, paddingHorizontal: 4 },
  cartTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#222",
    marginTop: 12,
  },
  cartTotalLabel: { color: "#aaa", fontSize: 16, fontWeight: "600" },
  cartTotalValue: { color: "#fff", fontSize: 22, fontWeight: "900" },
  emptyState: { alignItems: "center", padding: 48, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyText: { color: "#666", fontSize: 15 },
  authCard: {
    margin: 20,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    gap: 8,
  },
  inputLabel: { color: "#aaa", fontSize: 13, fontWeight: "600", marginTop: 8 },
  input: {
    backgroundColor: "#222",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#333",
  },
  errorText: { color: "#f87171", fontSize: 13, marginTop: 4 },
  welcomeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    margin: 20,
    marginTop: 0,
    padding: 18,
  },
  welcomeEmoji: { fontSize: 36 },
  welcomeName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  welcomeEmail: { color: "#666", fontSize: 13, marginTop: 2 },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statValue: { color: "#fff", fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#666", fontSize: 11, marginTop: 4 },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    gap: 10,
  },
  orderEmoji: { fontSize: 28 },
  orderInfo: { flex: 1 },
  orderName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  orderId: { color: "#666", fontSize: 11, marginTop: 2 },
  orderAmount: { color: "#fff", fontSize: 15, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  statusGreen: { backgroundColor: "#052e16" },
  statusAmber: { backgroundColor: "#2d1a00" },
  statusText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  logoutBtn: {
    margin: 20,
    marginTop: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  logoutText: { color: "#aaa", fontSize: 14, fontWeight: "600" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderTopWidth: 1,
    borderTopColor: "#222",
    paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  tabEmoji: { fontSize: 20 },
  tabLabel: { color: "#666", fontSize: 10, marginTop: 2, fontWeight: "600" },
  tabLabelActive: { color: "#2563eb" },
});
