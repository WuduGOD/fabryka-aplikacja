import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

export default function AdminAnalitykaScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  // ZAKŁADKI I FILTRY
  const [aktywnaZakladka, setAktywnaZakladka] = useState("wydajnosc"); // na_zywo, wydajnosc, produkcja
  const [filtrCzasu, setFiltrCzasu] = useState("dzisiaj");

  // DANE Z BAZY
  const [praceNaZywo, setPraceNaZywo] = useState<any[]>([]);
  const [historiaLogow, setHistoriaLogow] = useState<any[]>([]);
  const [zleceniaOkres, setZleceniaOkres] = useState<any[]>([]);

  const [rozwinietyPracownik, setRozwinietyPracownik] = useState<string | null>(
    null,
  );

  const pobierzZakresDat = () => {
    const teraz = new Date();
    let start = new Date();
    let end = new Date();

    switch (filtrCzasu) {
      case "dzisiaj":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "wczoraj":
        start.setDate(teraz.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(teraz.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case "tydzien":
        const day = teraz.getDay() || 7;
        if (day !== 1) start.setHours(-24 * (day - 1));
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "miesiac":
        start = new Date(teraz.getFullYear(), teraz.getMonth(), 1);
        end = new Date(
          teraz.getFullYear(),
          teraz.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        break;
      case "poprz_miesiac":
        start = new Date(teraz.getFullYear(), teraz.getMonth() - 1, 1);
        end = new Date(teraz.getFullYear(), teraz.getMonth(), 0, 23, 59, 59);
        break;
      case "rok":
        start = new Date(teraz.getFullYear(), 0, 1);
        end = new Date(teraz.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case "poprz_rok":
        start = new Date(teraz.getFullYear() - 1, 0, 1);
        end = new Date(teraz.getFullYear() - 1, 11, 31, 23, 59, 59);
        break;
    }
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const fetchDane = async () => {
    setLoading(true);
    try {
      const { start, end } = pobierzZakresDat();

      const { data: liveData } = await supabase
        .from("logi_pracy")
        .select(
          "*, pracownicy(nazwa_wyswietlana), pozycje_zlecenia(nazwa), zlecenia(numer_zd)",
        )
        .is("czas_stop", null)
        .order("czas_start", { ascending: false });
      if (liveData) setPraceNaZywo(liveData);

      const { data: histData } = await supabase
        .from("logi_pracy")
        .select("*, pracownicy(nazwa_wyswietlana), pozycje_zlecenia(nazwa)")
        .not("czas_stop", "is", null)
        .gte("czas_start", start)
        .lte("czas_start", end)
        .order("czas_start", { ascending: false });
      if (histData) setHistoriaLogow(histData);

      const { data: zlecData } = await supabase
        .from("zlecenia")
        .select("*")
        .gte("utworzono", start)
        .lte("utworzono", end);
      if (zlecData) setZleceniaOkres(zlecData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDane();
    setRozwinietyPracownik(null);
  }, [filtrCzasu]);

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    });

  // Przelicza minuty na ładny tekst (np. 1h 15min)
  const formatDuration = (minutes: number) => {
    if (!minutes || minutes < 1) return "< 1 min";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  };

  // --- NOWY SILNIK AGREGUJĄCY DANE (PODSUMOWANIA) ---
  const getRankingPracownikow = () => {
    const statystyki: Record<string, any> = {};

    historiaLogow.forEach((log) => {
      const id = log.id_pracownika;
      if (!statystyki[id]) {
        statystyki[id] = {
          id: id,
          nazwa: log.pracownicy?.nazwa_wyswietlana || "Nieznany",
          iloscOperacji: 0,
          iloscPauz: 0,
          czasSzyciaMinuty: 0,
          czasPauzyMinuty: 0,
          produkty: {}, // Słownik { "Materac": 5, "Poduszka": 2 }
        };
      }

      const emp = statystyki[id];

      // Obliczanie czasu trwania logu w minutach
      let durationMin = 0;
      if (log.czas_start && log.czas_stop) {
        const diffMs =
          new Date(log.czas_stop).getTime() -
          new Date(log.czas_start).getTime();
        durationMin = diffMs / (1000 * 60);
      }

      if (log.uwagi && log.uwagi.includes("PAUZA")) {
        emp.iloscPauz++;
        emp.czasPauzyMinuty += durationMin;
      } else {
        emp.iloscOperacji++;
        emp.czasSzyciaMinuty += durationMin;

        // Zliczanie konkretnych produktów!
        const nazwaProduktu =
          log.pozycje_zlecenia?.nazwa || "Inne / Niezidentyfikowane";
        if (!emp.produkty[nazwaProduktu]) {
          emp.produkty[nazwaProduktu] = 0;
        }
        emp.produkty[nazwaProduktu]++;
      }
    });

    return Object.values(statystyki).sort(
      (a, b) => b.iloscOperacji - a.iloscOperacji,
    );
  };

  // --- WIDOKI ---
  const renderNaZywo = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>
        🔴 Kto aktualnie pracuje ({praceNaZywo.length}):
      </Text>
      {praceNaZywo.length === 0 ? (
        <Text style={styles.emptyText}>
          Brak aktywnych prac. Wszyscy na pauzie lub skończyli.
        </Text>
      ) : null}
      {praceNaZywo.map((praca) => (
        <View key={praca.id} style={styles.liveCard}>
          <View style={styles.liveHeader}>
            <Text style={styles.livePracownik}>
              {praca.pracownicy?.nazwa_wyswietlana}
            </Text>
            <Text style={styles.liveCzas}>
              od {formatTime(praca.czas_start)}
            </Text>
          </View>
          <Text style={styles.liveZlecenie}>📦 {praca.zlecenia?.numer_zd}</Text>
          <Text style={styles.liveProdukt}>
            {praca.pozycje_zlecenia?.nazwa
              ? `🧵 Szyje: ${praca.pozycje_zlecenia.nazwa}`
              : `✂️ Cięcie / Inne`}
          </Text>
          {praca.uwagi && (
            <Text style={styles.uwagiText}>⚠️ {praca.uwagi}</Text>
          )}
        </View>
      ))}
    </View>
  );

  const renderWydajnosc = () => {
    const ranking = getRankingPracownikow();
    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>👥 Podsumowanie Pracowników:</Text>
        <Text style={styles.sectionDesc}>
          Skumulowane dane dla wybranego okresu.
        </Text>

        {ranking.length === 0 ? (
          <Text style={styles.emptyText}>
            Brak historii pracy w wybranym okresie.
          </Text>
        ) : null}

        {ranking.map((osoba: any, index: number) => {
          const isExpanded = rozwinietyPracownik === osoba.id;
          return (
            <View key={osoba.id} style={styles.employeeCard}>
              <TouchableOpacity
                style={styles.employeeHeader}
                onPress={() =>
                  setRozwinietyPracownik(isExpanded ? null : osoba.id)
                }
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <Text style={styles.medal}>
                    {index === 0
                      ? "🥇"
                      : index === 1
                        ? "🥈"
                        : index === 2
                          ? "🥉"
                          : "👤"}
                  </Text>
                  <View>
                    <Text style={styles.empName}>{osoba.nazwa}</Text>
                    <Text style={styles.empStats}>
                      Zakończone operacje: {osoba.iloscOperacji}
                    </Text>
                  </View>
                </View>
                <Text style={styles.chevron}>{isExpanded ? "▲" : "▼"}</Text>
              </TouchableOpacity>

              {/* ZAAWANSOWANE PODSUMOWANIE */}
              {isExpanded && (
                <View style={styles.employeeDetails}>
                  {/* Podsumowanie Czasu */}
                  <View style={styles.summaryBox}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>⏱ Czas Szycia:</Text>
                      <Text style={styles.summaryValue}>
                        {formatDuration(osoba.czasSzyciaMinuty)}
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>
                        ⏸ Przerwy ({osoba.iloscPauz}x):
                      </Text>
                      <Text style={[styles.summaryValue, { color: "#f59e0b" }]}>
                        {formatDuration(osoba.czasPauzyMinuty)}
                      </Text>
                    </View>
                  </View>

                  {/* Zliczone Produkty */}
                  <Text style={styles.detailHeader}>📦 WYKONANE PRODUKTY:</Text>
                  {Object.entries(osoba.produkty).length === 0 ? (
                    <Text style={styles.emptyText}>
                      Brak zszytych produktów.
                    </Text>
                  ) : (
                    Object.entries(osoba.produkty)
                      .sort(([, a]: any, [, b]: any) => b - a) // Sortuj od najczęściej szytego
                      .map(([nazwaProd, iloscSztuk]: any) => (
                        <View key={nazwaProd} style={styles.productRow}>
                          <Text style={styles.productName}>• {nazwaProd}</Text>
                          <Text style={styles.productCount}>{iloscSztuk}x</Text>
                        </View>
                      ))
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderProdukcja = () => {
    const zrealizowane = zleceniaOkres.filter(
      (z) => z.status === "zrealizowane",
    ).length;
    const odrzucone = zleceniaOkres.filter(
      (z) => z.status === "do_poprawki",
    ).length;
    const lacznie = zleceniaOkres.length;

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>🏭 Wskaźniki Procesu i Jakości:</Text>
        <Text style={styles.sectionDesc}>Ogólne statystyki zleceń.</Text>
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiBox, { borderTopColor: "#3b82f6" }]}>
            <Text style={styles.kpiBoxTitle}>Nowe Zlecenia</Text>
            <Text style={[styles.kpiBoxValue, { color: "#3b82f6" }]}>
              {lacznie}
            </Text>
          </View>
          <View style={[styles.kpiBox, { borderTopColor: "#10b981" }]}>
            <Text style={styles.kpiBoxTitle}>Zrealizowane</Text>
            <Text style={[styles.kpiBoxValue, { color: "#10b981" }]}>
              {zrealizowane}
            </Text>
          </View>
          <View style={[styles.kpiBox, { borderTopColor: "#ef4444" }]}>
            <Text style={styles.kpiBoxTitle}>Wskaźnik Odrzutów</Text>
            <Text style={[styles.kpiBoxValue, { color: "#ef4444" }]}>
              {odrzucone}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>System MES</Text>
        <Text style={styles.subtitle}>Analityka i Raporty (Dyrektor)</Text>
      </View>

      <View style={{ height: 60 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          {[
            "dzisiaj",
            "wczoraj",
            "tydzien",
            "miesiac",
            "poprz_miesiac",
            "rok",
            "poprz_rok",
          ].map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterPill,
                filtrCzasu === f && styles.filterPillActive,
              ]}
              onPress={() => setFiltrCzasu(f)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filtrCzasu === f && styles.filterPillTextActive,
                ]}
              >
                {f.replace("_", " ").toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            aktywnaZakladka === "na_zywo" && styles.tabBtnActive,
          ]}
          onPress={() => setAktywnaZakladka("na_zywo")}
        >
          <Text
            style={[
              styles.tabBtnText,
              aktywnaZakladka === "na_zywo" && styles.tabBtnTextActive,
            ]}
          >
            🔴 NA ŻYWO
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            aktywnaZakladka === "wydajnosc" && styles.tabBtnActive,
          ]}
          onPress={() => setAktywnaZakladka("wydajnosc")}
        >
          <Text
            style={[
              styles.tabBtnText,
              aktywnaZakladka === "wydajnosc" && styles.tabBtnTextActive,
            ]}
          >
            👥 KADRY
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            aktywnaZakladka === "produkcja" && styles.tabBtnActive,
          ]}
          onPress={() => setAktywnaZakladka("produkcja")}
        >
          <Text
            style={[
              styles.tabBtnText,
              aktywnaZakladka === "produkcja" && styles.tabBtnTextActive,
            ]}
          >
            🏭 PRODUKCJA
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchDane}
            colors={["#8b5cf6"]}
          />
        }
      >
        {loading && !historiaLogow.length ? (
          <ActivityIndicator
            size="large"
            color="#0f172a"
            style={{ marginTop: 50 }}
          />
        ) : (
          <>
            {aktywnaZakladka === "na_zywo" && renderNaZywo()}
            {aktywnaZakladka === "wydajnosc" && renderWydajnosc()}
            {aktywnaZakladka === "produkcja" && renderProdukcja()}
          </>
        )}
      </ScrollView>

      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>WRÓĆ DO MENU</Text>
        </TouchableOpacity>
      </View>
      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"dyrektor"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef2f6", paddingTop: 50 },
  header: { alignItems: "center", marginBottom: 10, paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 14, color: "#8b5cf6", fontWeight: "bold" },

  filtersScroll: { paddingHorizontal: 15, alignItems: "center" },
  filterPill: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  filterPillActive: { backgroundColor: "#0f172a" },
  filterPillText: { fontSize: 12, fontWeight: "bold", color: "#64748b" },
  filterPillTextActive: { color: "#ffffff" },

  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 15,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: "#8b5cf6" },
  tabBtnText: { fontSize: 13, fontWeight: "bold", color: "#94a3b8" },
  tabBtnTextActive: { color: "#8b5cf6" },

  tabContent: { padding: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  sectionDesc: { fontSize: 13, color: "#64748b", marginBottom: 20 },
  emptyText: {
    color: "#94a3b8",
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 20,
  },

  liveCard: {
    backgroundColor: "#fff",
    borderLeftWidth: 5,
    borderLeftColor: "#ef4444",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    shadowOpacity: 0.05,
    elevation: 2,
  },
  liveHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  livePracownik: { fontSize: 16, fontWeight: "bold", color: "#0f172a" },
  liveCzas: { fontSize: 13, color: "#ef4444", fontWeight: "bold" },
  liveZlecenie: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 4,
    fontWeight: "bold",
  },
  liveProdukt: { fontSize: 15, color: "#334155", fontWeight: "bold" },
  uwagiText: {
    marginTop: 8,
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "bold",
    backgroundColor: "#fffbeb",
    padding: 5,
    borderRadius: 5,
  },

  employeeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    shadowOpacity: 0.05,
    elevation: 2,
    overflow: "hidden",
  },
  employeeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#fff",
  },
  medal: { fontSize: 24, marginRight: 15 },
  empName: { fontSize: 16, fontWeight: "bold", color: "#0f172a" },
  empStats: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "bold",
  },
  chevron: { fontSize: 16, color: "#cbd5e1", fontWeight: "bold" },

  employeeDetails: {
    backgroundColor: "#f8fafc",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },

  summaryBox: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    justifyContent: "space-around",
  },
  summaryItem: { alignItems: "center" },
  summaryLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryValue: { fontSize: 16, fontWeight: "900", color: "#0f172a" },

  detailHeader: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 10,
    marginTop: 5,
  },
  productRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  productName: {
    fontSize: 14,
    color: "#334155",
    fontWeight: "600",
    flex: 1,
    paddingRight: 10,
  },
  productCount: {
    fontSize: 14,
    fontWeight: "900",
    color: "#8b5cf6",
    backgroundColor: "#f3e8ff",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 6,
  },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  kpiBox: {
    backgroundColor: "#fff",
    width: "48%",
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    borderTopWidth: 4,
    shadowOpacity: 0.04,
    elevation: 2,
  },
  kpiBoxTitle: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  kpiBoxValue: { fontSize: 32, fontWeight: "900" },

  footerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
