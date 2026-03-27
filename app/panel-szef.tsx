import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../supabase";

export default function PanelSzefAnalitykaScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Stany na statystyki
  const [statystyki, setStatystyki] = useState({
    w_produkcji: 0,
    do_poprawki: 0,
    do_kontroli: 0,
    krojownia: 0,
    szwalnia: 0,
    nowe: 0,
  });

  const [ostatnieGotowe, setOstatnieGotowe] = useState<any[]>([]);

  const fetchDaneAnalityczne = async () => {
    setLoading(true);
    try {
      // Pobieramy wszystkie aktywne zlecenia, żeby policzyć gdzie są
      const { data: wszystkieZlecenia } = await supabase
        .from("zlecenia")
        .select("id, status, numer_zd, utworzono")
        .neq("status", "zrealizowane"); // Bierzemy wszystko oprócz gotowych

      // Pobieramy 10 ostatnich ZREALIZOWANYCH
      const { data: zrealizowane } = await supabase
        .from("zlecenia")
        .select("id, status, numer_zd, utworzono")
        .eq("status", "zrealizowane")
        .order("utworzono", { ascending: false })
        .limit(10);

      if (wszystkieZlecenia) {
        setStatystyki({
          w_produkcji: wszystkieZlecenia.length,
          do_poprawki: wszystkieZlecenia.filter(
            (z) => z.status === "do_poprawki",
          ).length,
          do_kontroli: wszystkieZlecenia.filter(
            (z) => z.status === "do_kontroli",
          ).length,
          krojownia: wszystkieZlecenia.filter((z) =>
            ["krojenie_w_trakcie", "gotowe_do_szycia"].includes(z.status),
          ).length,
          szwalnia: wszystkieZlecenia.filter(
            (z) => z.status === "szycie_w_trakcie",
          ).length,
          nowe: wszystkieZlecenia.filter((z) => z.status === "nowe").length,
        });
      }

      if (zrealizowane) {
        setOstatnieGotowe(zrealizowane);
      }
    } catch (err) {
      console.error("Błąd pobierania danych:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDaneAnalityczne();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Komponent pojedynczego kafelka KPI
  const KpiCard = ({ title, value, color, icon }: any) => (
    <View style={[styles.kpiCard, { borderBottomColor: color }]}>
      <Text style={styles.kpiIcon}>{icon}</Text>
      <Text style={[styles.kpiValue, { color: color }]}>{value}</Text>
      <Text style={styles.kpiTitle}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Raport Produkcji</Text>
        <Text style={styles.subtitle}>Panel Szefa (Helicopter View)</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchDaneAnalityczne}
            colors={["#8b5cf6"]}
          />
        }
      >
        {/* SEKCJA 1: GŁÓWNE LICZNIKI (KPI) */}
        <View style={styles.kpiContainer}>
          <KpiCard
            title="W toku (Łącznie)"
            value={statystyki.w_produkcji}
            color="#3b82f6"
            icon="🏭"
          />
          <KpiCard
            title="Czeka na Kontrolę"
            value={statystyki.do_kontroli}
            color="#0ea5e9"
            icon="🔎"
          />
          <KpiCard
            title="Do Poprawki!"
            value={statystyki.do_poprawki}
            color="#ef4444"
            icon="🚨"
          />
        </View>

        {/* SEKCJA 2: LEJEK PRODUKCYJNY (Gdzie są zatory?) */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            📊 Obciążenie Działów (Zatory):
          </Text>
          <Text style={styles.sectionDesc}>
            Pokazuje, gdzie fizycznie znajdują się teraz wózki.
          </Text>

          <View style={styles.funnelRow}>
            <View style={styles.funnelStep}>
              <Text style={styles.funnelValue}>{statystyki.nowe}</Text>
              <Text style={styles.funnelLabel}>Biuro (Nowe)</Text>
            </View>
            <Text style={styles.funnelArrow}>➔</Text>
            <View style={styles.funnelStep}>
              <Text style={styles.funnelValue}>{statystyki.krojownia}</Text>
              <Text style={styles.funnelLabel}>Krojownia</Text>
            </View>
            <Text style={styles.funnelArrow}>➔</Text>
            <View style={styles.funnelStep}>
              <Text style={[styles.funnelValue, { color: "#8b5cf6" }]}>
                {statystyki.szwalnia}
              </Text>
              <Text style={styles.funnelLabel}>Szwalnia</Text>
            </View>
          </View>
        </View>

        {/* SEKCJA 3: OSTATNIO GOTOWE */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            ✅ Ostatnio Zrealizowane (Zjechały na Magazyn):
          </Text>
          {ostatnieGotowe.length === 0 ? (
            <Text style={styles.emptyText}>Brak gotowych zleceń.</Text>
          ) : (
            ostatnieGotowe.map((z, index) => (
              <View
                key={z.id}
                style={[
                  styles.listItem,
                  index === ostatnieGotowe.length - 1 && {
                    borderBottomWidth: 0,
                  },
                ]}
              >
                <Text style={styles.listIcon}>📦</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listZd}>{z.numer_zd}</Text>
                  <Text style={styles.listDate}>
                    Zlecono: {formatDate(z.utworzono)}
                  </Text>
                </View>
                <Text style={styles.listStatus}>GOTOWE</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: "#ef4444" }]}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.buttonText}>WYLOGUJ SIĘ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingTop: 50 },
  header: { alignItems: "center", marginBottom: 20, paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 16, color: "#8b5cf6", fontWeight: "bold" },

  kpiContainer: {
    flexDirection: "row",
    paddingHorizontal: 15,
    justifyContent: "space-between",
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#fff",
    marginHorizontal: 5,
    padding: 15,
    borderRadius: 16,
    alignItems: "center",
    borderBottomWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    elevation: 3,
  },
  kpiIcon: { fontSize: 24, marginBottom: 5 },
  kpiValue: { fontSize: 28, fontWeight: "900", marginBottom: 2 },
  kpiTitle: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "bold",
    textAlign: "center",
  },

  sectionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  sectionDesc: { fontSize: 12, color: "#94a3b8", marginBottom: 20 },

  funnelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f1f5f9",
    padding: 15,
    borderRadius: 12,
  },
  funnelStep: { alignItems: "center", flex: 1 },
  funnelValue: { fontSize: 24, fontWeight: "900", color: "#334155" },
  funnelLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#64748b",
    marginTop: 4,
    textTransform: "uppercase",
  },
  funnelArrow: { fontSize: 18, color: "#cbd5e1", fontWeight: "bold" },

  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  listIcon: { fontSize: 24, marginRight: 15 },
  listZd: { fontSize: 16, fontWeight: "bold", color: "#0f172a" },
  listDate: { fontSize: 12, color: "#64748b", marginTop: 2 },
  listStatus: {
    backgroundColor: "#ecfdf5",
    color: "#10b981",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: "bold",
  },

  emptyText: {
    color: "#94a3b8",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 10,
  },

  footerContainer: {
    padding: 20,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "#1e293b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
