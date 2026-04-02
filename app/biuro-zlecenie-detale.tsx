import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

export default function BiuroZlecenieDetaleScreen() {
  const router = useRouter();
  const { id, trybEdycji } = useLocalSearchParams();
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  // Flaga isMounted rozwiązująca problem React error #418 (błąd hydracji przy odświeżaniu)
  const [isMounted, setIsMounted] = useState(false);

  const [zlecenie, setZlecenie] = useState<any>(null);
  const [pozycje, setPozycje] = useState<any[]>([]);
  const [historia, setHistoria] = useState<any[]>([]);
  const [logiPracy, setLogiPracy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // --- STANY TRYBU EDYCJI ---
  const [isEditing, setIsEditing] = useState(trybEdycji === "tak");
  const [edytowanePozycje, setEdytowanePozycje] = useState<any[]>([]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (id && isMounted) fetchWszystkieDane();
  }, [id, isMounted]);

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
      const qLogi = supabase
        .from("logi_pracy")
        .select("*, pracownicy(nazwa_wyswietlana), pozycje_zlecenia(nazwa)")
        .eq("id_zlecenia", id)
        .order("czas_start", { ascending: false });

      const [resZlecenie, resPozycje, resHistoria, resLogi] = await Promise.all(
        [qZlecenie, qPozycje, qHistoria, qLogi],
      );

      if (resZlecenie.data) setZlecenie(resZlecenie.data);
      if (resPozycje.data) {
        setPozycje(resPozycje.data);
        // Kopiujemy pozycje do stanu roboczego do edycji
        setEdytowanePozycje(resPozycje.data);
      }
      if (resHistoria.data) setHistoria(resHistoria.data);
      if (resLogi.data) setLogiPracy(resLogi.data);
    } catch (err) {
      console.error("Błąd pobierania detali:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleZapiszZmiany = async () => {
    setLoading(true);
    try {
      // Zapisujemy w pętli każdą pozycję z zaktualizowanymi wartościami
      for (const item of edytowanePozycje) {
        await supabase
          .from("pozycje_zlecenia")
          .update({
            ilosc: parseInt(item.ilosc, 10) || 1, // Zabezpieczenie przed pustym polem
            instrukcje: item.instrukcje,
          })
          .eq("id", item.id);
      }

      if (Platform.OS === "web") {
        window.alert("Zapisano zmiany w zleceniu!");
      } else {
        Alert.alert("Sukces", "Zapisano zmiany w zleceniu.");
      }

      setIsEditing(false);
      fetchWszystkieDane();
    } catch (error) {
      Alert.alert("Błąd", "Wystąpił problem podczas zapisu zmian.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnulujEdycje = () => {
    setEdytowanePozycje([...pozycje]); // Przywracamy kopię z bazy
    setIsEditing(false);
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

  // Nie renderuj nic, dopóki przeglądarka i serwer się nie "dogadają"
  if (!isMounted) return null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={{ marginTop: 10, color: "#64748b" }}>
          Wczytywanie zlecenia...
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

  // Zabezpieczenie: Jeśli produkcja już ruszyła, pozwalamy zmienić tylko tekst uwag, ale ILOŚĆ jest zablokowana!
  const isProdukcjaStarted = ![
    "nowe",
    "oczekuje_kierownik",
    "oczekuje_krojownia",
  ].includes(zlecenie.status);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backArrow}
          onPress={() => router.replace("/biuro-lista-zlecen")}
        >
          <Text style={styles.chevronIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>{zlecenie.numer_zd}</Text>
          <Text style={styles.subtitle}>Podgląd Zlecenia (Biuro)</Text>
        </View>
        {!isEditing && (
          <TouchableOpacity
            style={styles.editHeaderBtn}
            onPress={() => setIsEditing(true)}
          >
            <Text style={styles.editHeaderBtnText}>✏️ EDYTUJ</Text>
          </TouchableOpacity>
        )}
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
            edytowanePozycje.map((item) => (
              <View key={item.id} style={styles.pozycjaItem}>
                <Text style={styles.pozycjaSymbol}>
                  {item.symbol || "Brak symbolu"}
                </Text>
                <Text style={styles.pozycjaNazwa}>
                  {item.nazwa} {!isEditing && `- `}
                  {!isEditing && (
                    <Text style={{ fontWeight: "bold" }}>
                      {item.ilosc} szt.
                    </Text>
                  )}
                </Text>

                {/* WIDOK EDYCJI */}
                {isEditing ? (
                  <View style={styles.editContainer}>
                    <Text style={styles.inputLabel}>Ilość sztuk:</Text>
                    <TextInput
                      style={[
                        styles.input,
                        isProdukcjaStarted && styles.inputDisabled,
                      ]}
                      value={String(item.ilosc)}
                      onChangeText={(text) => {
                        if (isProdukcjaStarted) return;
                        setEdytowanePozycje((prev) =>
                          prev.map((p) =>
                            p.id === item.id ? { ...p, ilosc: text } : p,
                          ),
                        );
                      }}
                      keyboardType="numeric"
                      editable={!isProdukcjaStarted} // Blokujemy zmianę, jeśli wózek pojechał na produkcję
                    />
                    {isProdukcjaStarted && (
                      <Text style={styles.warningText}>
                        ⚠️ Produkcja już ruszyła. Nie można edytować ilości!
                      </Text>
                    )}

                    <Text style={styles.inputLabel}>Uwagi / Instrukcje:</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={item.instrukcje}
                      onChangeText={(text) =>
                        setEdytowanePozycje((prev) =>
                          prev.map((p) =>
                            p.id === item.id ? { ...p, instrukcje: text } : p,
                          ),
                        )
                      }
                      multiline
                      placeholder="Wpisz uwagi (np. ZMIANA NICI)..."
                    />
                  </View>
                ) : /* WIDOK STANDARDOWY (Tylko odczyt) */
                item.instrukcje ? (
                  <Text style={styles.pozycjaInstrukcje}>
                    ⚠️ Uwagi: {item.instrukcje}
                  </Text>
                ) : null}
              </View>
            ))
          )}

          {/* PRZYCISKI ZAPISU W TRYBIE EDYCJI */}
          {isEditing && (
            <View style={styles.editActionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleAnulujEdycje}
              >
                <Text style={styles.cancelBtnText}>❌ ANULUJ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleZapiszZmiany}
              >
                <Text style={styles.saveBtnText}>💾 ZAPISZ ZMIANY</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            ⏱️ Rejestr Czasu Pracy na Produkcji:
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
          onPress={() => router.replace("/biuro-lista-zlecen")}
        >
          <Text style={styles.buttonText}>WRÓĆ DO LISTY</Text>
        </TouchableOpacity>
      </View>

      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"biuro"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingTop: 60 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
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
  subtitle: { fontSize: 16, color: "#2563eb", fontWeight: "bold" },

  editHeaderBtn: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  editHeaderBtnText: { color: "#0369a1", fontWeight: "bold", fontSize: 12 },

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
    paddingVertical: 15,
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
  pozycjaNazwa: { fontSize: 18, color: "#0f172a", fontWeight: "bold" },
  pozycjaInstrukcje: {
    fontSize: 13,
    color: "#ef4444",
    marginTop: 6,
    fontStyle: "italic",
    fontWeight: "bold",
  },

  // TRYB EDYCJI
  editContainer: {
    marginTop: 15,
    backgroundColor: "#f8fafc",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: "#0f172a",
  },
  inputDisabled: {
    backgroundColor: "#e2e8f0",
    color: "#94a3b8",
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  warningText: {
    fontSize: 11,
    color: "#ef4444",
    marginTop: 5,
    fontStyle: "italic",
    fontWeight: "bold",
  },
  editActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  cancelBtnText: { color: "#64748b", fontWeight: "bold" },
  saveBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#10b981",
  },
  saveBtnText: { color: "#ffffff", fontWeight: "bold" },

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
    backgroundColor: "#f8fafc",
  },
  backButton: {
    backgroundColor: "#1e293b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
