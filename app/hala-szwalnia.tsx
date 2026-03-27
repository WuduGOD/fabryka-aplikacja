import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

export default function SzwalniaScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  const [kodZlecenia, setKodZlecenia] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const isProcessing = useRef(false);

  const [zleceniaGotowe, setZleceniaGotowe] = useState<any[]>([]);
  const [zleceniaWTrakcie, setZleceniaWTrakcie] = useState<any[]>([]);
  const [zleceniaZapauzowane, setZleceniaZapauzowane] = useState<any[]>([]);

  const [pozycje, setPozycje] = useState<any[]>([]);
  const [wszystkieLogiPracownika, setWszystkieLogiPracownika] = useState<any[]>(
    [],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isPauseModalVisible, setIsPauseModalVisible] = useState(false);
  const [zlecenieDoPauzy, setZlecenieDoPauzy] = useState<any>(null);

  const fetchZlecenia = async (cicheOdswiezanie = false) => {
    if (!cicheOdswiezanie) setLoading(true);
    try {
      const { data: zleceniaData } = await supabase
        .from("zlecenia")
        .select("*")
        .in("status", ["gotowe_do_szycia", "szycie_w_trakcie", "do_poprawki"])
        .order("utworzono", { ascending: true });

      if (zleceniaData) {
        setZleceniaGotowe(
          zleceniaData.filter(
            (z) =>
              z.status === "gotowe_do_szycia" || z.status === "do_poprawki",
          ),
        );

        const { data: logiData } = await supabase
          .from("logi_pracy")
          .select("*")
          .eq("id_pracownika", idPracownika)
          .eq("etap_pracy", "szycie")
          .order("czas_start", { ascending: false });
        const logi = logiData || [];
        setWszystkieLogiPracownika(logi);

        const aktywneLogi = logi.filter((l) => l.czas_stop === null);
        const aktywneZleceniaIds = aktywneLogi.map((l) => l.id_zlecenia);
        const wszystkieSzyte = zleceniaData.filter(
          (z) => z.status === "szycie_w_trakcie",
        );

        const zapauzowaneIds: string[] = [];
        wszystkieSzyte.forEach((z) => {
          if (!aktywneZleceniaIds.includes(z.id)) {
            const ostatniLogZlecenia = logi.find((l) => l.id_zlecenia === z.id);
            if (
              ostatniLogZlecenia &&
              ostatniLogZlecenia.uwagi &&
              ostatniLogZlecenia.uwagi.includes("PAUZA")
            ) {
              zapauzowaneIds.push(z.id);
            }
          }
        });

        setZleceniaWTrakcie(
          wszystkieSzyte.filter((z) => !zapauzowaneIds.includes(z.id)),
        );
        setZleceniaZapauzowane(
          wszystkieSzyte.filter((z) => zapauzowaneIds.includes(z.id)),
        );

        const zleceniaIds = zleceniaData.map((z) => z.id);
        if (zleceniaIds.length > 0) {
          const { data: pozycjeData } = await supabase
            .from("pozycje_zlecenia")
            .select("*")
            .in("id_zlecenia", zleceniaIds)
            .eq("czy_z_regalu", false);
          if (pozycjeData) setPozycje(pozycjeData);
        } else {
          setPozycje([]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!cicheOdswiezanie) setLoading(false);
    }
  };

  useEffect(() => {
    fetchZlecenia();

    // Podpinamy nasłuch na żywo dla Krawcowych
    const subskrypcja = supabase
      .channel("zmiany_szwalnia")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zlecenia" },
        (payload) => {
          // Ciche odświeżanie, gdy Krojcza wyśle wózek do szycia
          fetchZlecenia(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subskrypcja);
    };
  }, []);

  // --- FILTR UWAG DLA SZWALNI ---
  const filtrujUwagiSzwalni = (instrukcje: string) => {
    if (!instrukcje) return "";

    // Szukamy słowa "PRODUKCJA" (lub "produkcja") i ucinamy wszystko od tego momentu
    const czesci = instrukcje.split(/PRODUKCJA/i);

    // Zwracamy tylko pierwszą część (to co było przed słowem PRODUKCJA), czyszcząc białe znaki
    return czesci[0].trim();
  };

  // --- KULOODPORNE ZAMYKANIE CZASU ---
  const handleStartPozycji = async (
    zlecenieId: string,
    pozycjaId: string,
    idFirmy: string,
  ) => {
    // 1. Błyskawiczna zmiana ekranu na zielony
    const tymczasowyLogId = "temp-" + Date.now();
    setWszystkieLogiPracownika((prev) => {
      const zamknieteStare = prev.map((l) =>
        l.czas_stop === null
          ? { ...l, czas_stop: new Date().toISOString() }
          : l,
      );
      return [
        {
          id: tymczasowyLogId,
          id_zlecenia: zlecenieId,
          id_pozycji: pozycjaId,
          czas_stop: null,
        },
        ...zamknieteStare,
      ];
    });

    // Zabezpieczenie przed "podwójnym kliknięciem" na ten sam guzik
    const aktywnyLog = wszystkieLogiPracownika.find(
      (l) => l.czas_stop === null,
    );
    if (aktywnyLog && aktywnyLog.id_pozycji === pozycjaId) return;

    // 2. POTĘŻNA KOMENDA DO BAZY: Zamknij bezwzględnie wszystkie otwarte czasy tej krawcowej!
    await supabase
      .from("logi_pracy")
      .update({ czas_stop: new Date().toISOString() })
      .eq("id_pracownika", idPracownika)
      .eq("etap_pracy", "szycie")
      .is("czas_stop", null);

    // 3. Start nowego czasu
    const { error: errInsert } = await supabase.from("logi_pracy").insert([
      {
        id_zlecenia: zlecenieId,
        id_pracownika: idPracownika,
        id_firmy: idFirmy,
        etap_pracy: "szycie",
        id_pozycji: pozycjaId,
      },
    ]);

    if (errInsert) {
      Alert.alert("Błąd zapisu (Baza Danych)", errInsert.message);
    }
    fetchZlecenia(true);
  };

  const handleZatwierdzPauze = async (powod: string) => {
    if (!zlecenieDoPauzy) return;
    setIsPauseModalVisible(false);

    setWszystkieLogiPracownika((prev) =>
      prev.map((l) =>
        l.id_zlecenia === zlecenieDoPauzy.id && l.czas_stop === null
          ? {
              ...l,
              czas_stop: new Date().toISOString(),
              uwagi: `PAUZA: ${powod}`,
            }
          : l,
      ),
    );

    // Zamykamy bazę z powodem pauzy
    await supabase
      .from("logi_pracy")
      .update({ czas_stop: new Date().toISOString(), uwagi: `PAUZA: ${powod}` })
      .eq("id_pracownika", idPracownika)
      .eq("etap_pracy", "szycie")
      .is("czas_stop", null);

    fetchZlecenia(true);
    setZlecenieDoPauzy(null);
  };

  const handleWznow = async (zlecenieId: string, idFirmy: string) => {
    const logiZlecenia = wszystkieLogiPracownika.filter(
      (p) => p.id_zlecenia === zlecenieId,
    );
    const pozycjaId = logiZlecenia[0] ? logiZlecenia[0].id_pozycji : null;

    setWszystkieLogiPracownika((prev) => [
      {
        id: "temp-" + Date.now(),
        id_zlecenia: zlecenieId,
        id_pozycji: pozycjaId,
        czas_stop: null,
      },
      ...prev,
    ]);

    const { error } = await supabase.from("logi_pracy").insert([
      {
        id_zlecenia: zlecenieId,
        id_pracownika: idPracownika,
        id_firmy: idFirmy,
        etap_pracy: "szycie",
        id_pozycji: pozycjaId,
      },
    ]);
    if (error) Alert.alert("Błąd wznawiania", error.message);
    fetchZlecenia(true);
  };

  const handleZakonczWozekRaw = async (zlecenie: any) => {
    const wykonajZakonczenie = async () => {
      setLoading(true);
      try {
        // Niezawodne zatrzymanie czasu na sam koniec dla całego wózka
        await supabase
          .from("logi_pracy")
          .update({ czas_stop: new Date().toISOString() })
          .eq("id_pracownika", idPracownika)
          .eq("etap_pracy", "szycie")
          .is("czas_stop", null);

        await supabase
          .from("zlecenia")
          .update({ status: "do_kontroli" })
          .eq("id", zlecenie.id);
        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: "szycie_w_trakcie",
            nowy_status: "do_kontroli",
          },
        ]);

        if (Platform.OS === "web") {
          window.alert(`Super! Wózek ${zlecenie.numer_zd} oddany do kontroli.`);
        } else {
          Alert.alert("Super!", `Wózek jedzie do kontroli!`);
        }

        setExpandedId(null);
        fetchZlecenia();
      } catch (e) {
        if (Platform.OS === "web") window.alert("Błąd zapisu.");
        else Alert.alert("Błąd zapisu.");
        setLoading(false);
      }
    };

    if (Platform.OS === "web") {
      const potwierdzenie = window.confirm(
        `✅ Zakończyć wózek?\nCzy na pewno uszyłaś wszystko z ${zlecenie.numer_zd}?`,
      );
      if (potwierdzenie) wykonajZakonczenie();
    } else {
      Alert.alert(
        "✅ Zakończyć wózek?",
        `Czy na pewno uszyłaś wszystko z ${zlecenie.numer_zd}?`,
        [
          { text: "Jeszcze szyję", style: "cancel" },
          { text: "Tak, oddaję!", onPress: wykonajZakonczenie },
        ],
      );
    }
  };
  const handleSkanujZlecenie = async (zeskanowanyKod?: string) => {
    const kodRaw =
      typeof zeskanowanyKod === "string" ? zeskanowanyKod : kodZlecenia;
    if (!kodRaw || !kodRaw.trim()) {
      Alert.alert("Błąd", "Zeskanuj kod ZD.");
      isProcessing.current = false;
      return;
    }
    try {
      setLoading(true);
      const czesci = kodRaw.split("^");
      const numerZD = czesci[0].trim();
      const { data: zlecenie } = await supabase
        .from("zlecenia")
        .select("*")
        .eq("numer_zd", numerZD)
        .single();
      if (!zlecenie) {
        Alert.alert("Błąd", `Nie znaleziono ZD: ${numerZD}`);
        return;
      }

      const aktualnyStatus = zlecenie.status;
      if (["nowe", "krojenie_w_trakcie"].includes(aktualnyStatus)) {
        Alert.alert("Błąd", "Zlecenie jest w Krojowni.");
        setIsCameraOpen(false);
        isProcessing.current = false;
        return;
      }
      if (["do_kontroli", "zrealizowane"].includes(aktualnyStatus)) {
        Alert.alert("Gotowe!", "Zlecenie jest w Kontroli lub Magazynie.");
        setIsCameraOpen(false);
        isProcessing.current = false;
        return;
      }

      if (
        aktualnyStatus === "gotowe_do_szycia" ||
        aktualnyStatus === "do_poprawki"
      ) {
        await supabase
          .from("zlecenia")
          .update({ status: "szycie_w_trakcie" })
          .eq("id", zlecenie.id);
        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: aktualnyStatus,
            nowy_status: "szycie_w_trakcie",
          },
        ]);
        setExpandedId(zlecenie.id);
      } else {
        setExpandedId(zlecenie.id);
      }

      setKodZlecenia("");
      setIsCameraOpen(false);
      Keyboard.dismiss();
      fetchZlecenia();
    } catch (err) {
      Alert.alert("Błąd bazy.");
      setLoading(false);
    } finally {
      setLoading(false);
      setTimeout(() => {
        isProcessing.current = false;
      }, 1000);
    }
  };

  const renderZlecenieAktywne = (z: any) => {
    const isExpanded = expandedId === z.id;
    const produktyZlecenia = pozycje.filter((p) => p.id_zlecenia === z.id);
    const aktywnyLog = wszystkieLogiPracownika.find(
      (l) => l.id_zlecenia === z.id && l.czas_stop === null,
    );
    const idSzytejTerazPozycji = aktywnyLog ? aktywnyLog.id_pozycji : null;

    return (
      <View
        key={z.id}
        style={[styles.listItem, { borderLeftColor: "#10b981" }]}
      >
        <TouchableOpacity
          style={styles.listHeader}
          onPress={() => setExpandedId(isExpanded ? null : z.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.listTextBold}>{z.numer_zd}</Text>
            {idSzytejTerazPozycji ? (
              <Text
                style={[
                  styles.listTextSub,
                  { color: "#10b981", fontWeight: "bold" },
                ]}
              >
                Szyjesz - Czas leci
              </Text>
            ) : (
              <Text
                style={[
                  styles.listTextSub,
                  { color: "#f59e0b", fontWeight: "bold" },
                ]}
              >
                Oczekuje - Wybierz co szyjesz!
              </Text>
            )}
          </View>
          {idSzytejTerazPozycji && (
            <TouchableOpacity
              style={styles.pauseButton}
              onPress={() => {
                setZlecenieDoPauzy(z);
                setIsPauseModalVisible(true);
              }}
            >
              <Text style={styles.pauseButtonText}>⏸️ PAUZA</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* OSTRZEŻENIE OD KONTROLI JAKOŚCI */}
            {z.status === "do_poprawki" && z.uwagi_z_kontroli ? (
              <View style={styles.poprawkaBox}>
                <Text style={styles.poprawkaLabel}>
                  🚨 ODRZUCONE PRZEZ KONTROLĘ (POPRAW!):
                </Text>
                <Text style={styles.poprawkaText}>{z.uwagi_z_kontroli}</Text>
              </View>
            ) : null}
            {produktyZlecenia.map((prod) => {
              const czySzyteTeraz = prod.id === idSzytejTerazPozycji;

              return (
                <View
                  key={prod.id}
                  style={[
                    styles.pozycjaRow,
                    czySzyteTeraz && styles.pozycjaAktywna,
                  ]}
                >
                  <View style={styles.pozycjaTopRow}>
                    <Text style={styles.pozycjaNazwa}>{prod.nazwa}</Text>
                    <Text style={styles.pozycjaDuzaIlosc}>
                      {prod.ilosc ?? 1} szt.
                    </Text>
                  </View>

                  {/* ZMIANA: Wyświetlamy tylko przefiltrowane uwagi */}
                  {prod.instrukcje &&
                  filtrujUwagiSzwalni(prod.instrukcje).length > 0 ? (
                    <View style={styles.instrukcjeBox}>
                      <Text style={styles.instrukcjeLabel}>
                        🧵 UWAGI DLA SZWALNI:
                      </Text>
                      <Text style={styles.instrukcjeText}>
                        {filtrujUwagiSzwalni(prod.instrukcje)}
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ alignItems: "flex-start", marginTop: 10 }}>
                    {czySzyteTeraz ? (
                      <View style={styles.szyteTerazBadge}>
                        <Text style={styles.szyteTerazText}>
                          🟢 SZYJESZ TO TERAZ
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.startProductBtn}
                        onPress={() =>
                          handleStartPozycji(z.id, prod.id, z.id_firmy)
                        }
                      >
                        <Text style={styles.startProductText}>
                          ▶️ ZACZNIJ SZYĆ
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.endCartButton}
              onPress={() => handleZakonczWozekRaw(z)}
            >
              <Text style={styles.endCartButtonText}>
                ✅ SKOŃCZYŁAM CAŁY WÓZEK
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderZlecenieZapauzowane = (z: any) => {
    return (
      <View
        key={z.id}
        style={[styles.listItem, { borderLeftColor: "#f59e0b" }]}
      >
        <View style={styles.listHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTextBold}>{z.numer_zd}</Text>
            <Text style={styles.listTextSub}>Wózek zatrzymany (Pauza)</Text>
          </View>
          <TouchableOpacity
            style={styles.resumeButton}
            onPress={() => handleWznow(z.id, z.id_firmy)}
          >
            <Text style={styles.resumeButtonText}>▶️ WZNÓW SZYCIE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderZlecenieOczekujace = (
    z: any,
    borderColor: string,
    subtitle: string,
  ) => {
    const isPoprawka = z.status === "do_poprawki";
    return (
      <View
        key={z.id}
        style={[
          styles.listItem,
          {
            borderLeftColor: isPoprawka ? "#ef4444" : borderColor,
            opacity: 0.7,
          },
        ]}
      >
        <View style={styles.listHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listTextBold}>
              {z.numer_zd}{" "}
              {isPoprawka && (
                <Text style={{ color: "#ef4444" }}> (DO POPRAWY!)</Text>
              )}
            </Text>
            <Text style={styles.listTextSub}>{subtitle}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (isCameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={({ data }) => {
            if (isProcessing.current) return;
            isProcessing.current = true;
            handleSkanujZlecenie(data);
          }}
        />
        <View style={styles.overlayTop}>
          <Text style={styles.overlayText}>Zeskanuj Kod ZD</Text>
        </View>
        <TouchableOpacity
          style={styles.closeCameraButton}
          onPress={() => setIsCameraOpen(false)}
        >
          <Text style={styles.buttonText}>ANULUJ I WRÓĆ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Modal
        visible={isPauseModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>☕ Wybierz powód pauzy:</Text>
            <TouchableOpacity
              style={styles.modalOptionBtn}
              onPress={() => handleZatwierdzPauze("Śniadanie / Przerwa")}
            >
              <Text style={styles.modalOptionText}>☕ Śniadanie / Przerwa</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOptionBtn}
              onPress={() => handleZatwierdzPauze("Brak materiału")}
            >
              <Text style={styles.modalOptionText}>🧵 Brak materiału</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOptionBtn}
              onPress={() => handleZatwierdzPauze("Awaria")}
            >
              <Text style={styles.modalOptionText}>🛠️ Awaria maszyny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOptionBtn}
              onPress={() => handleZatwierdzPauze("Toaleta")}
            >
              <Text style={styles.modalOptionText}>🚽 Toaleta</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setIsPauseModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>ANULUJ (Wróć do pracy)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Text style={styles.title}>Panel Szwalni</Text>
        <Text style={styles.subtitle}>Pracownik: {nazwaPracownika}</Text>
      </View>

      <View style={styles.listWrapper}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20, alignItems: "center" }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => fetchZlecenia(false)}
              colors={["#ec4899"]}
            />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.card}>
            <Text style={styles.label}>PODEJMIJ NOWY WÓZEK ZD:</Text>
            <TextInput
              style={styles.input}
              placeholder="Zeskanuj kod lub wpisz numer..."
              value={kodZlecenia}
              onChangeText={setKodZlecenia}
              onSubmitEditing={() => handleSkanujZlecenie()}
            />
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={async () => {
                if (!permission?.granted) {
                  const { granted } = await requestPermission();
                  if (!granted) return;
                }
                setIsCameraOpen(true);
              }}
            >
              <Text style={styles.cameraButtonText}>
                📸 WŁĄCZ SKANER (APARAT)
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator
              size="large"
              color="#ec4899"
              style={{ marginTop: 30 }}
            />
          ) : (
            <View style={{ width: "100%", maxWidth: 500 }}>
              {zleceniaWTrakcie.length > 0 && (
                <>
                  <Text style={styles.sectionHeader}>
                    🟢 TWOJE WÓZKI W TRAKCIE PRACY ({zleceniaWTrakcie.length}):
                  </Text>
                  {zleceniaWTrakcie.map((z) => renderZlecenieAktywne(z))}
                </>
              )}
              {zleceniaZapauzowane.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, { marginTop: 15 }]}>
                    ⏸️ WSTRZYMANE NA PAUZIE ({zleceniaZapauzowane.length}):
                  </Text>
                  {zleceniaZapauzowane.map((z) => renderZlecenieZapauzowane(z))}
                </>
              )}
              <Text style={[styles.sectionHeader, { marginTop: 25 }]}>
                📋 CZEKAJĄCE WÓZKI (Od krojczej) ({zleceniaGotowe.length}):
              </Text>
              {zleceniaGotowe.length === 0 && (
                <Text style={styles.emptyText}>Brak wózków od krojczej.</Text>
              )}
              {zleceniaGotowe.map((z) =>
                renderZlecenieOczekujace(
                  z,
                  "#8b5cf6",
                  "Zeskanuj kod ZD by wziąć wózek",
                ),
              )}
            </View>
          )}
        </ScrollView>
      </View>

      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.buttonText}>ZAKOŃCZ ZMIANĘ (WYLOGUJ)</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf4ff", paddingTop: 50 },
  header: { alignItems: "center", marginBottom: 15 },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 14, color: "#ec4899", fontWeight: "bold" },
  listWrapper: { flex: 1, width: "100%" },

  card: {
    width: "90%",
    maxWidth: 500,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    elevation: 5,
    marginBottom: 20,
    alignSelf: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#fdf4ff",
    borderWidth: 2,
    borderColor: "#fbcfe8",
    borderRadius: 12,
    padding: 15,
    fontSize: 18,
    marginBottom: 15,
  },
  cameraButton: {
    backgroundColor: "#8b5cf6",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  cameraButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },

  sectionHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  listItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 10,
    marginHorizontal: 20,
    borderLeftWidth: 5,
    shadowOpacity: 0.05,
    elevation: 2,
    overflow: "hidden",
  },
  listHeader: {
    flexDirection: "row",
    padding: 15,
    alignItems: "center",
    justifyContent: "space-between",
  },
  listTextBold: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  listTextSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  expandIcon: { fontSize: 20, color: "#94a3b8", paddingLeft: 10 },

  pauseButton: {
    backgroundColor: "#fef3c7",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  pauseButtonText: { color: "#d97706", fontWeight: "bold", fontSize: 13 },
  resumeButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  resumeButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  expandedContent: {
    backgroundColor: "#f8fafc",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  expandedTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 10,
    textTransform: "uppercase",
    paddingLeft: 5,
  },

  pozycjaRow: {
    marginBottom: 15,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  pozycjaAktywna: { borderColor: "#10b981", backgroundColor: "#f0fff4" },

  pozycjaTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  pozycjaNazwa: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    flex: 1,
    paddingRight: 10,
  },
  pozycjaDuzaIlosc: {
    fontSize: 26,
    fontWeight: "900",
    color: "#ec4899",
    backgroundColor: "#fdf4ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: "hidden",
  },

  instrukcjeBox: {
    backgroundColor: "#fef08a",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#eab308",
  },
  instrukcjeLabel: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#a16207",
    marginBottom: 5,
  },
  instrukcjeText: { fontSize: 18, fontWeight: "900", color: "#0f172a" },

  startProductBtn: {
    backgroundColor: "#e2e8f0",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  startProductText: { color: "#334155", fontWeight: "bold", fontSize: 15 },
  szyteTerazBadge: {
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  szyteTerazText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  endCartButton: {
    backgroundColor: "#0f172a",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  endCartButtonText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },

  emptyText: { color: "#94a3b8", paddingHorizontal: 20, fontStyle: "italic" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 25,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 20,
    textAlign: "center",
  },
  modalOptionBtn: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalOptionText: { fontSize: 18, color: "#334155", fontWeight: "bold" },
  modalCancelBtn: {
    marginTop: 25,
    backgroundColor: "#f1f5f9",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCancelText: { color: "#64748b", fontWeight: "bold", fontSize: 14 },

  footerContainer: {
    padding: 20,
    backgroundColor: "#fdf4ff",
    borderTopWidth: 1,
    borderTopColor: "#fbcfe8",
    alignItems: "center",
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },

  overlayTop: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 15,
    borderRadius: 20,
  },
  overlayText: {
    color: "white",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 16,
  },
  closeCameraButton: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: "#ef4444",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
  },
  poprawkaBox: {
    backgroundColor: "#fef2f2",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: "#ef4444",
  },
  poprawkaLabel: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#b91c1c",
    marginBottom: 5,
  },
  poprawkaText: { fontSize: 18, fontWeight: "900", color: "#7f1d1d" },
});
