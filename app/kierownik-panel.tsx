import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

type Pozycja = {
  id: string;
  symbol: string;
  nazwa: string;
  ilosc: number;
  instrukcje: string;
  czy_z_regalu: boolean;
};

type Zlecenie = {
  id: string;
  id_firmy: string;
  numer_zd: string;
  status: string;
  utworzono: string;
  pozycje_zlecenia: Pozycja[];
};

export default function KierownikPanelScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  // Dwie osobne listy zleceń
  const [zleceniaNowe, setZleceniaNowe] = useState<Zlecenie[]>([]);
  const [zleceniaUszyte, setZleceniaUszyte] = useState<Zlecenie[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchZlecenia = async (cicheOdswiezanie = false) => {
    if (!cicheOdswiezanie) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("zlecenia")
        .select(
          `
          id,
          id_firmy,
          numer_zd,
          status,
          utworzono,
          pozycje_zlecenia (id, symbol, nazwa, ilosc, instrukcje, czy_z_regalu)
        `,
        )
        // POBIERAMY OBA STATUSY
        .in("status", ["oczekuje_kierownik", "oczekuje_kompletacja"])
        .order("utworzono", { ascending: false });

      if (error) throw error;

      if (data) {
        setZleceniaNowe(
          data.filter((z) => z.status === "oczekuje_kierownik") as Zlecenie[],
        );
        setZleceniaUszyte(
          data.filter((z) => z.status === "oczekuje_kompletacja") as Zlecenie[],
        );
      }
    } catch (error: any) {
      Alert.alert("Błąd", "Nie udało się pobrać zleceń: " + error.message);
    } finally {
      if (!cicheOdswiezanie) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchZlecenia();

    const subskrypcja = supabase
      .channel("zmiany_u_kierownika")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zlecenia" },
        () => {
          fetchZlecenia(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subskrypcja);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchZlecenia();
  };

  // --- LOGIKA 1: ZLECENIA NOWE Z BIURA ---
  const toggleProduktZRegalu = async (
    idZlecenia: string,
    idPozycji: string,
    obecnyStan: boolean,
  ) => {
    const nowyStan = !obecnyStan;
    setZleceniaNowe((prev) =>
      prev.map((z) => {
        if (z.id === idZlecenia) {
          return {
            ...z,
            pozycje_zlecenia: z.pozycje_zlecenia.map((p) =>
              p.id === idPozycji ? { ...p, czy_z_regalu: nowyStan } : p,
            ),
          };
        }
        return z;
      }),
    );

    const { error } = await supabase
      .from("pozycje_zlecenia")
      .update({ czy_z_regalu: nowyStan })
      .eq("id", idPozycji);
    if (error) {
      Alert.alert("Błąd", "Nie udało się zapisać wyboru w bazie.");
      fetchZlecenia(true);
    }
  };

  const zatwierdzNoweZlecenie = async (zlecenie: Zlecenie) => {
    if (!zlecenie.pozycje_zlecenia || zlecenie.pozycje_zlecenia.length === 0) {
      Alert.alert("Błąd", "Zlecenie nie ma produktów.");
      return;
    }

    const wszystkieZRegalu = zlecenie.pozycje_zlecenia.every(
      (p) => p.czy_z_regalu,
    );
    // Jeśli wszystko mamy, leci prosto do kompletacji u Kierownika. Jeśli braki - szyjemy.
    const docelowyStatus = wszystkieZRegalu
      ? "oczekuje_kompletacja"
      : "oczekuje_krojownia";
    const nazwaKierunku = wszystkieZRegalu
      ? "Gotowe do kompletacji"
      : "Krojowni (Szyjemy braki)";

    try {
      await supabase
        .from("zlecenia")
        .update({ status: docelowyStatus })
        .eq("id", zlecenie.id);
      if (idPracownika) {
        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: "oczekuje_kierownik",
            nowy_status: docelowyStatus,
          },
        ]);
        await supabase.from("logi_pracy").insert([
          {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            etap_pracy: "decyzja_kierownik",
            czas_stop: new Date().toISOString(),
          },
        ]);
      }
      Alert.alert("Przekazano!", `Poszło do: ${nazwaKierunku}`);
      fetchZlecenia(true);
    } catch (error: any) {
      Alert.alert("Błąd", error.message);
    }
  };

  // --- LOGIKA 2: TRZY DROGI DLA ZLECEŃ USZYTYCH / Z REGAŁU ---

  const handleNaUbieralnie = async (zlecenie: Zlecenie) => {
    try {
      await supabase
        .from("zlecenia")
        .update({ status: "oczekuje_ubieralnia" })
        .eq("id", zlecenie.id);

      if (idPracownika) {
        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: "oczekuje_kompletacja",
            nowy_status: "oczekuje_ubieralnia",
          },
        ]);
      }

      if (Platform.OS === "web") window.alert("Wysłano na Ubieralnię!");
      else Alert.alert("Sukces", "Wysłano na Ubieralnię!");

      fetchZlecenia(true);
    } catch (error: any) {
      Alert.alert("Błąd", error.message);
    }
  };

  const handleDoWysylki = async (zlecenie: Zlecenie) => {
    try {
      await supabase
        .from("zlecenia")
        .update({ status: "do_wysylki" })
        .eq("id", zlecenie.id);

      if (idPracownika) {
        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: "oczekuje_kompletacja",
            nowy_status: "do_wysylki",
          },
        ]);
      }

      if (Platform.OS === "web") window.alert("Zlecenie czeka na wysyłkę!");
      else Alert.alert("Sukces", "Zlecenie czeka na wysyłkę!");

      fetchZlecenia(true);
    } catch (error: any) {
      Alert.alert("Błąd", error.message);
    }
  };

  const handleNaRegal = async (zlecenie: Zlecenie) => {
    try {
      await supabase
        .from("zlecenia")
        .update({ status: "zrealizowane" })
        .eq("id", zlecenie.id);

      if (idPracownika) {
        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: "oczekuje_kompletacja",
            nowy_status: "zrealizowane",
          },
        ]);
      }

      if (Platform.OS === "web")
        window.alert("Odłożono na regał (Zrealizowano)!");
      else Alert.alert("Sukces", "Odłożono na regał (Zrealizowano)!");

      fetchZlecenia(true);
    } catch (error: any) {
      Alert.alert("Błąd", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Panel Kierownika</Text>
          <Text style={styles.subtitle}>
            Zalogowano: {nazwaPracownika || "Brak nazwy"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.logoutBtnText}>Wyloguj</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Aktualizacja danych...</Text>
          </View>
        ) : (
          <>
            {/* SEKCJA 1: NOWE OD BIURA */}
            <View style={styles.sekcjaBox}>
              <Text style={styles.sekcjaNaglowek}>
                📥 NOWE ZLECENIA OD BIURA ({zleceniaNowe.length})
              </Text>
              <Text style={styles.sekcjaOpis}>
                Wybierz, co leży na regale, a co trzeba uszyć.
              </Text>

              {zleceniaNowe.length === 0 && (
                <Text style={styles.brakDanych}>Brak nowych zleceń.</Text>
              )}

              {zleceniaNowe.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.numerZD}>{item.numer_zd}</Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>DO ROZDZIELENIA</Text>
                    </View>
                  </View>

                  <View style={styles.pozycjeContainer}>
                    {item.pozycje_zlecenia?.map((poz) => (
                      <TouchableOpacity
                        key={poz.id}
                        style={[
                          styles.pozycjaWiersz,
                          poz.czy_z_regalu && styles.pozycjaZRegalu,
                        ]}
                        onPress={() =>
                          toggleProduktZRegalu(
                            item.id,
                            poz.id,
                            poz.czy_z_regalu,
                          )
                        }
                      >
                        <View
                          style={[
                            styles.checkbox,
                            poz.czy_z_regalu
                              ? styles.checkboxActive
                              : styles.checkboxInactive,
                          ]}
                        >
                          <Text style={styles.checkboxText}>
                            {poz.czy_z_regalu ? "✓" : ""}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.pozycjaIlosc,
                            poz.czy_z_regalu && {
                              backgroundColor: "#d1fae5",
                              color: "#059669",
                            },
                          ]}
                        >
                          {poz.ilosc}x
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.pozycjaNazwa,
                              poz.czy_z_regalu && { color: "#059669" },
                            ]}
                          >
                            {poz.nazwa}
                          </Text>
                          {poz.czy_z_regalu ? (
                            <Text style={styles.infoRegal}>
                              📦 Mam to fizycznie na regale
                            </Text>
                          ) : (
                            <Text style={styles.pozycjaSymbol}>
                              Zleć do ucięcia/uszycia
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.btnActionPrimary}
                    onPress={() => zatwierdzNoweZlecenie(item)}
                  >
                    <Text style={styles.btnActionText}>
                      ZATWIERDŹ I PRZEKAŻ DALEJ
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* SEKCJA 2: GOTOWE USZYTE / Z REGAŁU */}
            <View style={[styles.sekcjaBox, { marginTop: 20 }]}>
              <Text style={[styles.sekcjaNaglowek, { color: "#8b5cf6" }]}>
                ✨ GOTOWE DO DECYZJI ({zleceniaUszyte.length})
              </Text>
              <Text style={styles.sekcjaOpis}>
                Wózki uszyte na hali ORAZ te skompletowane z regału.
              </Text>

              {zleceniaUszyte.length === 0 && (
                <Text style={styles.brakDanych}>
                  Brak pokrowców do wydania.
                </Text>
              )}

              {zleceniaUszyte.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.card,
                    { borderColor: "#c4b5fd", borderWidth: 2 },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.numerZD}>{item.numer_zd}</Text>
                    <View
                      style={[styles.badge, { backgroundColor: "#ede9fe" }]}
                    >
                      <Text style={[styles.badgeText, { color: "#7c3aed" }]}>
                        OCZEKUJE NA WYDANIE
                      </Text>
                    </View>
                  </View>

                  <View style={styles.pozycjeList}>
                    {item.pozycje_zlecenia?.map((poz) => (
                      <Text key={poz.id} style={styles.pozycjaZwykla}>
                        • {poz.ilosc}x {poz.nazwa}
                      </Text>
                    ))}
                  </View>

                  <Text style={styles.pytanieText}>
                    Gdzie przekazujesz ten wózek?
                  </Text>

                  {/* NOWE 3 PRZYCISKI DECYZYJNE */}
                  <View style={{ flexDirection: "column", gap: 10 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: "#3b82f6",
                        padding: 15,
                        borderRadius: 10,
                        alignItems: "center",
                      }}
                      onPress={() => handleNaUbieralnie(item)}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold" }}>
                        🛠️ PRZEKAŻ NA UBIERALNIĘ (Materac)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        backgroundColor: "#8b5cf6",
                        padding: 15,
                        borderRadius: 10,
                        alignItems: "center",
                      }}
                      onPress={() => handleDoWysylki(item)}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold" }}>
                        📦 DO WYSYŁKI (Samo zamówienie)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        backgroundColor: "#10b981",
                        padding: 15,
                        borderRadius: 10,
                        alignItems: "center",
                      }}
                      onPress={() => handleNaRegal(item)}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold" }}>
                        🗄️ ODŁÓŻ NA REGAŁ (Produkcja na stan)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"kierownik_produkcji"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 20,
    paddingTop: 60,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 5,
  },
  title: { fontSize: 24, fontWeight: "900", color: "#ffffff" },
  subtitle: { fontSize: 14, color: "#94a3b8" },
  logoutBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutBtnText: { color: "#ffffff", fontWeight: "bold" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: { marginTop: 10, color: "#64748b", fontSize: 16 },

  listContainer: { padding: 15, paddingBottom: 40 },

  sekcjaBox: { marginBottom: 10 },
  sekcjaNaglowek: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  sekcjaOpis: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  brakDanych: {
    fontStyle: "italic",
    color: "#94a3b8",
    paddingHorizontal: 5,
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 10,
  },
  numerZD: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  badge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: "#d97706", fontSize: 10, fontWeight: "bold" },

  pozycjeContainer: { marginBottom: 20 },
  pozycjaWiersz: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  pozycjaZRegalu: { backgroundColor: "#f0fdf4", borderColor: "#10b981" },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  checkboxActive: { backgroundColor: "#10b981", borderColor: "#10b981" },
  checkboxInactive: { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" },
  checkboxText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  pozycjaIlosc: {
    backgroundColor: "#e0f2fe",
    color: "#0284c7",
    fontSize: 16,
    fontWeight: "900",
    padding: 8,
    borderRadius: 8,
    marginRight: 12,
    minWidth: 45,
    textAlign: "center",
  },
  pozycjaNazwa: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  pozycjaSymbol: { fontSize: 12, color: "#64748b" },
  infoRegal: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "bold",
    marginTop: 2,
  },

  pozycjeList: {
    marginBottom: 15,
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
  },
  pozycjaZwykla: {
    fontSize: 15,
    color: "#334155",
    fontWeight: "bold",
    marginBottom: 4,
  },

  pytanieText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 10,
    textAlign: "center",
    textTransform: "uppercase",
  },
  btnRow: { flexDirection: "row", gap: 10 },
  btnDecyzja: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDecyzjaText: { color: "#fff", fontWeight: "bold", fontSize: 13 },

  btnActionPrimary: {
    backgroundColor: "#0f172a",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  btnActionText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
});
