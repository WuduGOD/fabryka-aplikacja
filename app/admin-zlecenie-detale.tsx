import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

export default function AdminZlecenieDetaleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  const [zlecenie, setZlecenie] = useState<any>(null);
  const [pozycje, setPozycje] = useState<any[]>([]);
  const [historia, setHistoria] = useState<any[]>([]);
  const [logiPracy, setLogiPracy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchWszystkieDane();
    }
  }, [id]);

  const fetchWszystkieDane = async () => {
    setLoading(true);
    try {
      const qZlecenie = supabase
        .from("zlecenia")
        .select("*")
        .eq("id", id)
        .single();
      const qPozycje = supabase
        .from("pozycje_zlecenia")
        .select("*")
        .eq("id_zlecenia", id);
      const qHistoria = supabase
        .from("historia_statusow")
        .select("*, pracownicy(nazwa_wyswietlana)")
        .eq("id_zlecenia", id)
        .order("utworzono", { ascending: false });

      // ZMIANA: Pobieramy logi pracy wraz z nazwami produktów (pozycje_zlecenia)
      const qLogi = supabase
        .from("logi_pracy")
        .select("*, pracownicy(nazwa_wyswietlana), pozycje_zlecenia(nazwa)")
        .eq("id_zlecenia", id)
        .order("czas_start", { ascending: false });

      const [resZlecenie, resPozycje, resHistoria, resLogi] = await Promise.all(
        [qZlecenie, qPozycje, qHistoria, qLogi],
      );

      if (resZlecenie.data) setZlecenie(resZlecenie.data);
      if (resPozycje.data) setPozycje(resPozycje.data);
      if (resHistoria.data) setHistoria(resHistoria.data);
      if (resLogi.data) setLogiPracy(resLogi.data);
    } catch (err) {
      console.error("Błąd pobierania detali:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={{ marginTop: 10, color: "#64748b" }}>
          Wczytywanie historii...
        </Text>
      </View>
    );
  }

  if (!zlecenie) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Nie znaleziono zlecenia.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backArrow}
          onPress={() => router.back()}
        >
          <Text style={styles.chevronIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>{zlecenie.numer_zd}</Text>
          <Text style={styles.subtitle}>Szczegóły i Historia</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            📦 Lista Pozycji do Wykonania:
          </Text>
          {pozycje.length === 0 ? (
            <Text style={styles.emptyText}>Brak produktów w zleceniu.</Text>
          ) : (
            pozycje.map((item) => (
              <View key={item.id} style={styles.pozycjaItem}>
                <Text style={styles.pozycjaSymbol}>
                  {item.symbol || "Brak symbolu"}
                </Text>
                <Text style={styles.pozycjaNazwa}>
                  {item.nazwa} -{" "}
                  <Text style={{ fontWeight: "bold" }}>{item.ilosc} szt.</Text>
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            ⏱️ Rejestr Czasu Pracy (Odbicia):
          </Text>
          {logiPracy.length === 0 ? (
            <Text style={styles.emptyText}>
              Brak zarejestrowanego czasu pracy.
            </Text>
          ) : (
            logiPracy.map((log) => (
              <View key={log.id} style={styles.logContainer}>
                <View style={styles.logHeaderRow}>
                  <Text style={styles.logEtapBadge}>
                    {log.etap_pracy.toUpperCase()}
                  </Text>
                  <Text style={styles.logPracownik}>
                    {log.pracownicy?.nazwa_wyswietlana}
                  </Text>
                </View>

                {/* NOWOŚĆ: Wyświetlanie nazwy konkretnego produktu */}
                <Text style={styles.logProduktNazwa}>
                  {log.pozycje_zlecenia?.nazwa
                    ? `🧵 Szyto: ${log.pozycje_zlecenia.nazwa}`
                    : log.etap_pracy === "krojenie"
                      ? "✂️ Cięcie całości"
                      : "🛠️ Inna czynność"}
                </Text>

                <View style={styles.logCzasRow}>
                  <Text style={styles.logCzasLabel}>
                    Start:{" "}
                    <Text style={styles.logCzasValue}>
                      {formatDateTime(log.czas_start)}
                    </Text>
                  </Text>
                  <Text style={styles.logCzasLabel}>
                    Stop:{" "}
                    {log.czas_stop ? (
                      <Text style={styles.logCzasValue}>
                        {formatDateTime(log.czas_stop)}
                      </Text>
                    ) : (
                      <Text style={{ color: "#10b981", fontWeight: "bold" }}>
                        W TRAKCIE...
                      </Text>
                    )}
                  </Text>
                </View>

                {log.uwagi ? (
                  <Text style={styles.logUwagi}>⚠️ {log.uwagi}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>WRÓĆ DO LISTY</Text>
        </TouchableOpacity>
      </View>
      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"admin"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef2f6", paddingTop: 60 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#eef2f6",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  backArrow: { marginRight: 15, padding: 5 },
  chevronIcon: { fontSize: 36, color: "#0f172a", fontWeight: "bold" },
  headerTextContainer: { flex: 1 },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a", marginBottom: 2 },
  subtitle: { fontSize: 16, color: "#64748b" },

  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    marginHorizontal: 20,
    shadowOpacity: 0.05,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 15,
  },
  emptyText: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 14,
    marginTop: 10,
  },

  pozycjaItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  pozycjaSymbol: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#3b82f6",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  pozycjaNazwa: { fontSize: 15, color: "#334155" },

  logContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  logHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logEtapBadge: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    fontSize: 11,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  logPracownik: { fontSize: 13, color: "#64748b", fontWeight: "bold" },
  logProduktNazwa: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 8,
  },
  logCzasRow: {
    flexDirection: "column",
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  logCzasLabel: { fontSize: 12, color: "#64748b" },
  logCzasValue: { color: "#0f172a", fontWeight: "bold" },
  logUwagi: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 8,
    backgroundColor: "#fef2f2",
    padding: 8,
    borderRadius: 8,
  },

  footer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    padding: 20,
    alignItems: "center",
    backgroundColor: "#eef2f6",
  },
  backButton: {
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
