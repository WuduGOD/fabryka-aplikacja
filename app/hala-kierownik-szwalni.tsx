import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

export default function KierownikSzwalniScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [wybranaData, setWybranaData] = useState(new Date());
  const [zlecenia, setZlecenia] = useState<any[]>([]);
  const [logi, setLogi] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  const fetchDaneSzwalni = async () => {
    setLoading(true);
    try {
      const startDnia = new Date(wybranaData);
      startDnia.setHours(0, 0, 0, 0);
      const koniecDnia = new Date(wybranaData);
      koniecDnia.setHours(23, 59, 59, 999);

      // POBIERAMY LOGI + NAZWY PRACOWNIKÓW + NAZWY PRODUKTÓW
      const { data: logiData, error: errLogi } = await supabase
        .from("logi_pracy")
        .select("*, pracownicy(nazwa_wyswietlana), pozycje_zlecenia(nazwa)")
        .eq("etap_pracy", "szycie")
        .lte("czas_start", koniecDnia.toISOString())
        .or(`czas_stop.gte.${startDnia.toISOString()},czas_stop.is.null`)
        .order("czas_start", { ascending: false });

      if (errLogi || !logiData || logiData.length === 0) {
        setZlecenia([]);
        setLogi([]);
        setLoading(false);
        return;
      }

      setLogi(logiData);
      const unikalneZleceniaIds = [
        ...new Set(logiData.map((l) => l.id_zlecenia)),
      ];

      const { data: zleceniaData } = await supabase
        .from("zlecenia")
        .select("*")
        .in("id", unikalneZleceniaIds);
      if (zleceniaData) setZlecenia(zleceniaData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDaneSzwalni();
  }, [wybranaData]);

  const zmienDzien = (ileDni: number) => {
    const nowaData = new Date(wybranaData);
    nowaData.setDate(nowaData.getDate() + ileDni);
    setWybranaData(nowaData);
    setExpandedId(null);
  };

  const czyDzisiaj = () => {
    const dzisiaj = new Date();
    return (
      wybranaData.getDate() === dzisiaj.getDate() &&
      wybranaData.getMonth() === dzisiaj.getMonth() &&
      wybranaData.getFullYear() === dzisiaj.getFullYear()
    );
  };

  const formatHour = (dateString: string) => {
    if (!dateString) return "...";
    return new Date(dateString).toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDataRaportu = (data: Date) => {
    return data.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const renderZlecenieKarta = (z: any) => {
    const isExpanded = expandedId === z.id;
    const logiZlecenia = logi.filter((l) => l.id_zlecenia === z.id);
    const najnowszyLog = logiZlecenia[0];

    let krotkiOpis = "Brak aktywności";
    let kolorRamki = "#94a3b8";
    let ikona = "⚪";

    if (z.status === "szycie_w_trakcie") {
      if (najnowszyLog && !najnowszyLog.czas_stop) {
        krotkiOpis = `Szyje: ${najnowszyLog.pracownicy?.nazwa_wyswietlana}`;
        kolorRamki = "#10b981";
        ikona = "🟢";
      } else if (
        najnowszyLog &&
        najnowszyLog.uwagi &&
        najnowszyLog.uwagi.includes("PAUZA")
      ) {
        krotkiOpis = `PAUZA: ${najnowszyLog.pracownicy?.nazwa_wyswietlana}`;
        kolorRamki = "#f59e0b";
        ikona = "⏸️";
      } else {
        krotkiOpis = `Oczekuje na wznowienie`;
        kolorRamki = "#3b82f6";
        ikona = "🔵";
      }
    } else if (["do_kontroli", "zrealizowane"].includes(z.status)) {
      const sformatowanyStatus = z.status.replace(/_/g, " ");
      krotkiOpis = `Wózek uszyty (Status: ${sformatowanyStatus})`;
      kolorRamki = "#8b5cf6";
      ikona = "✅";
    } else if (z.status === "do_poprawki") {
      krotkiOpis = `Odrzucone z kontroli - DO POPRAWY`;
      kolorRamki = "#ef4444";
      ikona = "❌";
    }

    return (
      <View key={z.id} style={[styles.card, { borderLeftColor: kolorRamki }]}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpandedId(isExpanded ? null : z.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.zdText}>
              {ikona} {z.numer_zd}
            </Text>
            <Text style={[styles.statusText, { color: kolorRamki }]}>
              {krotkiOpis}
            </Text>
          </View>
          <Text style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.expandedTitle}>
              Historia szycia z dnia {wybranaData.toLocaleDateString("pl-PL")}:
            </Text>
            {logiZlecenia.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    {/* WYSWIETLAMY NAZWĘ PRODUKTU */}
                    <Text style={styles.logProdukt}>
                      {log.pozycje_zlecenia?.nazwa
                        ? `🧵 ${log.pozycje_zlecenia.nazwa}`
                        : "🛠️ Inna czynność"}
                    </Text>
                    <Text style={styles.logPracownik}>
                      {log.pracownicy?.nazwa_wyswietlana}
                    </Text>
                  </View>
                  <Text style={styles.logCzas}>
                    {formatHour(log.czas_start)} -{" "}
                    {log.czas_stop ? formatHour(log.czas_stop) : "TRWA"}
                  </Text>
                </View>
                {log.uwagi ? (
                  <Text style={styles.logUwagi}>⚠️ {log.uwagi}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const zleceniaAktywne = zlecenia.filter(
    (z) => z.status === "szycie_w_trakcie",
  );
  const zleceniaZakonczone = zlecenia.filter((z) =>
    ["do_kontroli", "zrealizowane"].includes(z.status),
  );
  const zleceniaPoprawki = zlecenia.filter((z) => z.status === "do_poprawki");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Raporty Szwalni</Text>
        <Text style={styles.subtitle}>Panel Kierownika</Text>
      </View>

      <View style={styles.dateSelector}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => zmienDzien(-1)}>
          <Text style={styles.dateBtnText}>◀ Wczoraj</Text>
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateText}>{formatDataRaportu(wybranaData)}</Text>
          {czyDzisiaj() ? (
            <Text style={styles.dateSubText}>(Dzisiaj)</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.dateBtn, czyDzisiaj() && { opacity: 0.3 }]}
          onPress={() => !czyDzisiaj() && zmienDzien(1)}
          disabled={czyDzisiaj()}
        >
          <Text style={styles.dateBtnText}>Jutro ▶</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listWrapper}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchDaneSzwalni}
              colors={["#8b5cf6"]}
            />
          }
        >
          {zlecenia.length === 0 ? (
            <Text style={styles.emptyText}>
              Brak jakiejkolwiek aktywności na szwalni w tym dniu.
            </Text>
          ) : (
            <>
              {zleceniaAktywne.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={styles.sectionHeader}>
                    🧵 W TRAKCIE SZYCIA / ZAPAUZOWANE:
                  </Text>
                  {zleceniaAktywne.map((z) => renderZlecenieKarta(z))}
                </View>
              )}
              {zleceniaZakonczone.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={styles.sectionHeader}>
                    ✅ ZAKOŃCZONE I ODDANE DALEJ:
                  </Text>
                  {zleceniaZakonczone.map((z) => renderZlecenieKarta(z))}
                </View>
              )}
              {zleceniaPoprawki.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={styles.sectionHeader}>
                    ❌ ZWRÓCONE DO POPRAWKI:
                  </Text>
                  {zleceniaPoprawki.map((z) => renderZlecenieKarta(z))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>

      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>WRÓĆ DO KROJOWNI</Text>
        </TouchableOpacity>
      </View>
      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"krojcza_kierownik_szwalni"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingTop: 50 },
  header: { alignItems: "center", marginBottom: 15, paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 16, color: "#8b5cf6", fontWeight: "bold" },
  listWrapper: { flex: 1, width: "100%" },

  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    elevation: 3,
  },
  dateBtn: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
  },
  dateBtnText: { color: "#475569", fontWeight: "bold", fontSize: 14 },
  dateCenter: { alignItems: "center" },
  dateText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0f172a",
    textTransform: "capitalize",
  },
  dateSubText: { fontSize: 12, color: "#10b981", fontWeight: "bold" },

  sectionHeader: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 10,
    marginTop: 10,
  },
  emptyText: {
    color: "#94a3b8",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 15,
    borderLeftWidth: 6,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    elevation: 2,
    overflow: "hidden",
  },
  cardHeader: { flexDirection: "row", padding: 15, alignItems: "center" },
  zdText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  statusText: { fontSize: 13, fontWeight: "bold" },
  expandIcon: { fontSize: 18, color: "#94a3b8", paddingLeft: 10 },

  expandedContent: {
    backgroundColor: "#fdf4ff",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#fbcfe8",
  },
  expandedTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#8b5cf6",
    marginBottom: 10,
    textTransform: "uppercase",
  },

  logRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  logProdukt: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },
  logPracownik: { fontSize: 13, fontWeight: "bold", color: "#64748b" },
  logCzas: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "bold",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  logUwagi: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 6,
    fontWeight: "bold",
    backgroundColor: "#fef2f2",
    padding: 8,
    borderRadius: 6,
  },

  footerContainer: {
    padding: 20,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "#64748b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
