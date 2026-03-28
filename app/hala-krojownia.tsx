import { CameraView, useCameraPermissions } from "expo-camera";
import * as Network from "expo-network";
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
  SafeAreaView, // <-- Dodano do bezpiecznego paska!
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { SyncManager } from "../components/SyncManager";
import { supabase } from "../supabase";

export default function KrojowniaScreen() {
  const router = useRouter();

  const [kodZlecenia, setKodZlecenia] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const isProcessing = useRef(false);

  const [zleceniaNowe, setZleceniaNowe] = useState<any[]>([]);
  const [zleceniaWTrakcie, setZleceniaWTrakcie] = useState<any[]>([]);
  const [zleceniaDoKontroli, setZleceniaDoKontroli] = useState<any[]>([]);

  const [pozycje, setPozycje] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // --- STANY OFFLINE ---
  const [isOnline, setIsOnline] = useState(true);
  const [zalegleSkany, setZalegleSkany] = useState(0);

  const [qcZlecenie, setQcZlecenie] = useState<any>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [powodOdrzucenia, setPowodOdrzucenia] = useState("");
  const { idPracownika, nazwaPracownika, rola } = useLocalSearchParams();

  const fetchZlecenia = async (cicheOdswiezanie = false) => {
    if (!cicheOdswiezanie) setLoading(true);
    try {
      const { data: zleceniaData } = await supabase
        .from("zlecenia")
        .select("*")
        .in("status", [
          "oczekuje_krojownia",
          "krojenie_w_trakcie",
          "do_kontroli",
        ])
        .order("utworzono", { ascending: true });

      if (zleceniaData) {
        setZleceniaNowe(
          zleceniaData.filter((z) => z.status === "oczekuje_krojownia"),
        );
        setZleceniaWTrakcie(
          zleceniaData.filter((z) => z.status === "krojenie_w_trakcie"),
        );
        setZleceniaDoKontroli(
          zleceniaData.filter((z) => z.status === "do_kontroli"),
        );

        const zleceniaIds = zleceniaData.map((z) => z.id);
        if (zleceniaIds.length > 0) {
          const { data: pozycjeData } = await supabase
            .from("pozycje_zlecenia")
            .select("*")
            .in("id_zlecenia", zleceniaIds);

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

    const netInterval = setInterval(async () => {
      const netInfo = await Network.getNetworkStateAsync();
      setIsOnline(!!(netInfo.isConnected && netInfo.isInternetReachable));
      setZalegleSkany(await SyncManager.pobierzIloscWklejce());
    }, 3000);

    const subskrypcja = supabase
      .channel("zmiany_krojownia")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zlecenia" },
        (payload) => {
          fetchZlecenia(true);
        },
      )
      .subscribe();

    return () => {
      clearInterval(netInterval);
      supabase.removeChannel(subskrypcja);
    };
  }, []);

  const handleZatwierdzQC = async () => {
    if (!qcZlecenie) return;
    setLoading(true);
    try {
      if (isOnline) {
        await supabase
          .from("zlecenia")
          .update({ status: "oczekuje_kompletacja", uwagi_z_kontroli: null })
          .eq("id", qcZlecenie.id);

        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: qcZlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: qcZlecenie.id_firmy,
            stary_status: "do_kontroli",
            nowy_status: "oczekuje_kompletacja",
          },
        ]);

        if (Platform.OS === "web") {
          window.alert(
            `Zatwierdzono! ZD ${qcZlecenie.numer_zd} czeka na decyzję Kierownika.`,
          );
        } else {
          Alert.alert(
            "Zatwierdzono!",
            `ZD ${qcZlecenie.numer_zd} czeka na decyzję Kierownika.`,
          );
        }
      } else {
        await SyncManager.dodajDoKolejki(
          "zlecenia",
          "UPDATE",
          { status: "oczekuje_kompletacja", uwagi_z_kontroli: null },
          qcZlecenie.id,
        );
        await SyncManager.dodajDoKolejki("historia_statusow", "INSERT", {
          id_zlecenia: qcZlecenie.id,
          id_pracownika: idPracownika,
          id_firmy: qcZlecenie.id_firmy,
          stary_status: "do_kontroli",
          nowy_status: "oczekuje_kompletacja",
        });
        Alert.alert("Tryb Offline", "Zapisano. Wyślemy gdy wróci internet.");
      }

      setQcZlecenie(null);
      setLoading(false);

      if (isOnline) fetchZlecenia(true);
      else
        setZleceniaDoKontroli((prev) =>
          prev.filter((z) => z.id !== qcZlecenie.id),
        );
    } catch (e) {
      Alert.alert("Błąd", "Nie udało się zatwierdzić.");
      setLoading(false);
    }
  };

  const handleOdrzucQC = async () => {
    if (!powodOdrzucenia.trim()) {
      if (Platform.OS === "web") window.alert("Wpisz powód odrzucenia!");
      else Alert.alert("Błąd", "Wpisz powód odrzucenia!");
      return;
    }
    setLoading(true);
    try {
      if (isOnline) {
        await supabase
          .from("zlecenia")
          .update({
            status: "do_poprawki",
            uwagi_z_kontroli: powodOdrzucenia.trim(),
          })
          .eq("id", qcZlecenie.id);

        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: qcZlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: qcZlecenie.id_firmy,
            stary_status: "do_kontroli",
            nowy_status: "do_poprawki",
          },
        ]);

        if (Platform.OS === "web")
          window.alert(
            `Odrzucono! ZD ${qcZlecenie.numer_zd} wraca do szwalni.`,
          );
        else
          Alert.alert(
            "Odrzucono!",
            `ZD ${qcZlecenie.numer_zd} wraca do szwalni.`,
          );
      } else {
        await SyncManager.dodajDoKolejki(
          "zlecenia",
          "UPDATE",
          { status: "do_poprawki", uwagi_z_kontroli: powodOdrzucenia.trim() },
          qcZlecenie.id,
        );
        await SyncManager.dodajDoKolejki("historia_statusow", "INSERT", {
          id_zlecenia: qcZlecenie.id,
          id_pracownika: idPracownika,
          id_firmy: qcZlecenie.id_firmy,
          stary_status: "do_kontroli",
          nowy_status: "do_poprawki",
        });
        Alert.alert("Tryb Offline", "Odrzucono w trybie offline.");
      }

      setQcZlecenie(null);
      setLoading(false);

      if (isOnline) fetchZlecenia(true);
      else
        setZleceniaDoKontroli((prev) =>
          prev.filter((z) => z.id !== qcZlecenie.id),
        );
    } catch (e) {
      Alert.alert("Błąd", "Nie udało się odrzucić.");
      setLoading(false);
    }
  };

  const handleOtworzKontrole = (zlecenie: any) => {
    setQcZlecenie(zlecenie);
    setIsRejecting(false);
    setPowodOdrzucenia("");
  };

  const handleSkanujZlecenie = async (zeskanowanyKod?: string) => {
    const kodRaw =
      typeof zeskanowanyKod === "string" ? zeskanowanyKod : kodZlecenia;
    if (!kodRaw || !kodRaw.trim()) {
      Alert.alert("Błąd", "Zeskanuj lub wpisz kod ZD.");
      isProcessing.current = false;
      return;
    }

    try {
      setLoading(true);
      const czesci = kodRaw.split("^");
      const numerZD = czesci[0].trim();

      const wszystkieLokalne = [
        ...zleceniaNowe,
        ...zleceniaWTrakcie,
        ...zleceniaDoKontroli,
      ];
      const zlecenie = wszystkieLokalne.find((z) => z.numer_zd === numerZD);

      if (!zlecenie) {
        Alert.alert("Błąd", `Nie znaleziono ZD: ${numerZD}`);
        setLoading(false);
        isProcessing.current = false;
        return;
      }

      const aktualnyStatus = zlecenie.status;

      if (aktualnyStatus === "do_kontroli") {
        setKodZlecenia("");
        setIsCameraOpen(false);
        Keyboard.dismiss();
        setLoading(false);
        handleOtworzKontrole(zlecenie);
        return;
      }

      if (
        [
          "gotowe_do_szycia",
          "szycie_w_trakcie",
          "do_poprawki",
          "zrealizowane",
        ].includes(aktualnyStatus)
      ) {
        Alert.alert(
          "Zablokowane",
          "To zlecenie jest na szwalni lub zostało już zrealizowane.",
        );
        setIsCameraOpen(false);
        isProcessing.current = false;
        setLoading(false);
        return;
      }

      if (aktualnyStatus === "oczekuje_krojownia") {
        if (isOnline) {
          await supabase.from("logi_pracy").insert([
            {
              id_zlecenia: zlecenie.id,
              id_pracownika: idPracownika,
              id_firmy: zlecenie.id_firmy,
              etap_pracy: "krojenie",
            },
          ]);
          await supabase
            .from("zlecenia")
            .update({ status: "krojenie_w_trakcie" })
            .eq("id", zlecenie.id);
          await supabase.from("historia_statusow").insert([
            {
              id_zlecenia: zlecenie.id,
              id_pracownika: idPracownika,
              id_firmy: zlecenie.id_firmy,
              stary_status: "oczekuje_krojownia",
              nowy_status: "krojenie_w_trakcie",
            },
          ]);
          Alert.alert("Rozpoczęto!", `Pobrano do krojenia: ${numerZD}`);
        } else {
          await SyncManager.dodajDoKolejki("logi_pracy", "INSERT", {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            etap_pracy: "krojenie",
          });
          await SyncManager.dodajDoKolejki(
            "zlecenia",
            "UPDATE",
            { status: "krojenie_w_trakcie" },
            zlecenie.id,
          );
          await SyncManager.dodajDoKolejki("historia_statusow", "INSERT", {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: "oczekuje_krojownia",
            nowy_status: "krojenie_w_trakcie",
          });
          Alert.alert("Rozpoczęto (Offline)", `Zapisano w kolejce: ${numerZD}`);
        }
      } else if (aktualnyStatus === "krojenie_w_trakcie") {
        const czasZakonczenia = new Date().toISOString();

        if (isOnline) {
          // --- NOWA, KULO-ODPORNA LOGIKA ZAMYKANIA LOGU ---
          // Aktualizujemy bezpośrednio wszystkie otwarte logi krojenia dla tego zlecenia,
          // dzięki temu odpada problem błędu .maybeSingle() gdy np. były dwa!
          await supabase
            .from("logi_pracy")
            .update({ czas_stop: czasZakonczenia })
            .match({ id_zlecenia: zlecenie.id, etap_pracy: "krojenie" })
            .is("czas_stop", null); // Tylko te, które faktycznie trwają

          await supabase
            .from("zlecenia")
            .update({ status: "gotowe_do_szycia" })
            .eq("id", zlecenie.id);

          await supabase.from("historia_statusow").insert([
            {
              id_zlecenia: zlecenie.id,
              id_pracownika: idPracownika,
              id_firmy: zlecenie.id_firmy,
              stary_status: "krojenie_w_trakcie",
              nowy_status: "gotowe_do_szycia",
            },
          ]);
          Alert.alert(
            "Zakończono cięcie!",
            `Materiał z ${numerZD} gotowy dla Szwalni.`,
          );
        } else {
          // W trybie offline też wymuszamy zaktualizowanie na podstawie pasujących kluczy (match)
          await SyncManager.dodajDoKolejki(
            "logi_pracy",
            "UPDATE",
            { czas_stop: czasZakonczenia },
            { id_zlecenia: zlecenie.id, etap_pracy: "krojenie" },
          );
          await SyncManager.dodajDoKolejki(
            "zlecenia",
            "UPDATE",
            { status: "gotowe_do_szycia" },
            zlecenie.id,
          );
          await SyncManager.dodajDoKolejki("historia_statusow", "INSERT", {
            id_zlecenia: zlecenie.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenie.id_firmy,
            stary_status: "krojenie_w_trakcie",
            nowy_status: "gotowe_do_szycia",
          });
          Alert.alert("Zakończono (Offline)", `Zapisano w trybie offline.`);
        }
      }

      setKodZlecenia("");
      setIsCameraOpen(false);
      Keyboard.dismiss();

      if (isOnline) {
        fetchZlecenia(true);
      } else {
        if (aktualnyStatus === "oczekuje_krojownia") {
          setZleceniaNowe((p) => p.filter((z) => z.id !== zlecenie.id));
          setZleceniaWTrakcie((p) => [
            ...p,
            { ...zlecenie, status: "krojenie_w_trakcie" },
          ]);
        } else if (aktualnyStatus === "krojenie_w_trakcie") {
          setZleceniaWTrakcie((p) => p.filter((z) => z.id !== zlecenie.id));
        }
      }
    } catch (err) {
      Alert.alert("Błąd", "Problem z aplikacją.");
    } finally {
      setLoading(false);
      setTimeout(() => {
        isProcessing.current = false;
      }, 1000);
    }
  };

  const handleOtworzKamere = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    isProcessing.current = false;
    setIsCameraOpen(true);
  };

  const renderZlecenieKarta = (
    z: any,
    borderColor: string,
    subtitle: string,
  ) => {
    const isExpanded = expandedId === z.id;
    const produktyZlecenia = pozycje.filter((p) => p.id_zlecenia === z.id);

    return (
      <View
        key={z.id}
        style={[styles.listItem, { borderLeftColor: borderColor }]}
      >
        <TouchableOpacity
          style={styles.listHeader}
          onPress={() => setExpandedId(isExpanded ? null : z.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.listTextBold}>{z.numer_zd}</Text>
            <Text style={styles.listTextSub}>{subtitle}</Text>
          </View>
          <Text style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.expandedTitle}>
              Decyzja Kierownika (co uciąć, a co z regału):
            </Text>
            {produktyZlecenia.length === 0 ? (
              <Text style={styles.emptyText}>Brak dodanych produktów.</Text>
            ) : (
              produktyZlecenia.map((prod) => {
                const doSzycia = !prod.czy_z_regalu;
                return (
                  <View
                    key={prod.id}
                    style={[
                      styles.pozycjaRow,
                      !doSzycia && {
                        backgroundColor: "#f8fafc",
                        borderColor: "#e2e8f0",
                        opacity: 0.8,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        doSzycia
                          ? styles.checkboxActive
                          : styles.checkboxInactive,
                      ]}
                    >
                      <Text style={styles.checkboxText}>
                        {doSzycia ? "✂️" : "📦"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.pozycjaNazwa,
                          !doSzycia && styles.pozycjaPrzekreslona,
                        ]}
                      >
                        {prod.nazwa}{" "}
                        <Text
                          style={[
                            styles.pozycjaIlosc,
                            !doSzycia && { color: "#94a3b8" },
                          ]}
                        >
                          (x{prod.ilosc})
                        </Text>
                      </Text>
                      {prod.instrukcje && doSzycia ? (
                        <Text style={styles.pozycjaInstrukcja}>
                          Uwagi: {prod.instrukcje}
                        </Text>
                      ) : null}
                      {!doSzycia && (
                        <Text style={styles.pozycjaInfoMagazyn}>
                          Kierownik wziął z regału. POMIŃ TĘ POZYCJĘ.
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>
    );
  };

  const renderZlecenieQC = (z: any) => {
    return (
      <View
        key={z.id}
        style={[
          styles.listItem,
          { borderLeftColor: "#0ea5e9", backgroundColor: "#f0fdfa" },
        ]}
      >
        <TouchableOpacity
          style={styles.listHeader}
          onPress={() => handleOtworzKontrole(z)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.listTextBold}>{z.numer_zd}</Text>
            <Text
              style={[
                styles.listTextSub,
                { color: "#0d9488", fontWeight: "bold" },
              ]}
            >
              Wózek uszyty - KLIKNIJ BY OCENIĆ
            </Text>
          </View>
          <Text style={styles.expandIcon}>🔎</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (isCameraOpen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
        {/* Pasek Offline w aparacie z SafeAreaView chroni przed wejściem na zegarek */}
        {!isOnline && (
          <View
            style={{
              width: "100%",
              backgroundColor: "#ef4444",
              paddingVertical: 10,
              alignItems: "center",
              zIndex: 1000,
            }}
          >
            <Text style={{ color: "white", fontWeight: "bold" }}>
              ⚠️ BRAK INTERNETU - Tryb Offline
            </Text>
          </View>
        )}
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
          <Text style={styles.overlayText}>
            Zeskanuj ZD do cięcia / kontroli
          </Text>
        </View>
        <TouchableOpacity
          style={styles.closeCameraButton}
          onPress={() => setIsCameraOpen(false)}
        >
          <Text style={styles.buttonText}>ANULUJ I WRÓĆ</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // --- ZMIANA: Główny kontener to SafeAreaView (bezpieczna strefa) zamiast KeyboardAvoidingView
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      {/* Pasek Offline - teraz przyczepiony w bezpiecznej strefie */}
      {!isOnline && (
        <View
          style={{
            width: "100%",
            backgroundColor: "#ef4444",
            paddingVertical: 10,
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <Text style={{ color: "white", fontWeight: "bold" }}>
            ⚠️ BRAK INTERNETU - Tryb Offline
          </Text>
          {zalegleSkany > 0 && (
            <Text style={{ color: "white", fontSize: 12 }}>
              Oczekujące skany w schowku: {zalegleSkany}
            </Text>
          )}
        </View>
      )}

      {/* Układ pod klawiaturę jest teraz wewnątrz SafeAreaView */}
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: isOnline ? 20 : 10 }]} // Zmniejszony margines jeśli jest pasek
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Modal visible={!!qcZlecenie} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.qcModalContent}>
              <Text style={styles.qcModalTitle}>
                🔎 KONTROLA: {qcZlecenie?.numer_zd}
              </Text>

              {!isRejecting ? (
                <>
                  <Text style={styles.qcModalSubtitle}>
                    Produkty w tym wózku do sprawdzenia:
                  </Text>
                  <ScrollView
                    style={styles.qcItemsList}
                    showsVerticalScrollIndicator={false}
                  >
                    {pozycje
                      .filter((p) => p.id_zlecenia === qcZlecenie?.id)
                      .map((prod) => (
                        <View key={prod.id} style={styles.qcPozycjaRow}>
                          <Text
                            style={[
                              styles.qcPozycjaNazwa,
                              prod.czy_z_regalu && { color: "#94a3b8" },
                            ]}
                          >
                            {prod.czy_z_regalu ? "📦 " : "🧵 "} {prod.nazwa}
                          </Text>
                          <Text style={styles.qcPozycjaIlosc}>
                            {prod.ilosc ?? 1} szt.
                          </Text>
                        </View>
                      ))}
                  </ScrollView>

                  <View style={styles.qcActionButtonsRow}>
                    <TouchableOpacity
                      style={[styles.qcDecisionBtn, styles.qcBtnReject]}
                      onPress={() => setIsRejecting(true)}
                    >
                      <Text
                        style={[styles.qcDecisionBtnText, { color: "#ef4444" }]}
                      >
                        ❌ ODRZUĆ DO POPRAWKI
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.qcDecisionBtn, styles.qcBtnApprove]}
                      onPress={handleZatwierdzQC}
                    >
                      <Text
                        style={[styles.qcDecisionBtnText, { color: "#fff" }]}
                      >
                        ✅ ZATWIERDŹ (GOTOWE)
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.qcCancelBtn}
                    onPress={() => setQcZlecenie(null)}
                  >
                    <Text style={styles.qcCancelBtnText}>
                      Zamknij okno (Zrobię to później)
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={{ width: "100%" }}>
                  <Text
                    style={[
                      styles.qcModalSubtitle,
                      { color: "#ef4444", fontWeight: "bold" },
                    ]}
                  >
                    Napisz krawcowej, co ma poprawić:
                  </Text>
                  <TextInput
                    style={styles.qcUwagiInput}
                    multiline={true}
                    numberOfLines={4}
                    placeholder="np. Szycie na rogu materaca puściło..."
                    value={powodOdrzucenia}
                    onChangeText={setPowodOdrzucenia}
                    autoFocus={true}
                  />
                  <View
                    style={{ flexDirection: "row", gap: 10, marginTop: 15 }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.qcModalBtn,
                        { backgroundColor: "#f1f5f9", flex: 1 },
                      ]}
                      onPress={() => setIsRejecting(false)}
                    >
                      <Text
                        style={{
                          color: "#64748b",
                          fontWeight: "bold",
                          textAlign: "center",
                        }}
                      >
                        COFNIJ
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.qcModalBtn,
                        { backgroundColor: "#ef4444", flex: 1 },
                      ]}
                      onPress={handleOdrzucQC}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "bold",
                          textAlign: "center",
                        }}
                      >
                        ZWRÓĆ DO SZWALNI
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>

        <View style={styles.header}>
          <Text style={styles.title}>Panel Krojowni</Text>
          <Text style={styles.subtitle}>Zalogowano: {nazwaPracownika}</Text>
          <TouchableOpacity
            style={styles.managerButton}
            onPress={() => router.push("/hala-kierownik-szwalni")}
          >
            <Text style={styles.managerButtonText}>
              📊 PODGLĄD SZWALNI (KIEROWNIK)
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listWrapper}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20, alignItems: "center" }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => fetchZlecenia(false)}
                colors={["#f59e0b"]}
              />
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.card}>
              <Text style={styles.label}>
                SKANUJ WÓZEK (CIĘCIE LUB KONTROLA):
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Wpisz ręcznie..."
                value={kodZlecenia}
                onChangeText={setKodZlecenia}
                onSubmitEditing={() => handleSkanujZlecenie()}
              />
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleSkanujZlecenie()}
              >
                <Text style={styles.actionButtonText}>ZATWIERDŹ ZD</Text>
              </TouchableOpacity>
              <View style={styles.divider}>
                <Text style={styles.dividerText}>LUB</Text>
              </View>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={handleOtworzKamere}
              >
                <Text style={styles.cameraButtonText}>📸 UŻYJ APARATU</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator
                size="large"
                color="#f59e0b"
                style={{ marginTop: 20 }}
              />
            ) : (
              <View style={{ width: "100%", maxWidth: 500 }}>
                {zleceniaDoKontroli.length > 0 && (
                  <View style={{ marginBottom: 25 }}>
                    <Text style={[styles.sectionHeader, { color: "#0ea5e9" }]}>
                      🔎 DO SPRAWDZENIA OD KRAWCZOWYCH (
                      {zleceniaDoKontroli.length}):
                    </Text>
                    {zleceniaDoKontroli.map((z) => renderZlecenieQC(z))}
                  </View>
                )}

                <Text style={styles.sectionHeader}>
                  ⏳ W TRAKCIE CIĘCIA ({zleceniaWTrakcie.length}):
                </Text>
                {zleceniaWTrakcie.length === 0 && (
                  <Text style={styles.emptyText}>Brak otwartych zleceń.</Text>
                )}
                {zleceniaWTrakcie.map((z) =>
                  renderZlecenieKarta(
                    z,
                    "#f59e0b",
                    "Zeskanuj ponownie by zakończyć",
                  ),
                )}

                <Text style={[styles.sectionHeader, { marginTop: 25 }]}>
                  📋 OCZEKUJĄCE DO SKROJENIA ({zleceniaNowe.length}):
                </Text>
                {zleceniaNowe.length === 0 && (
                  <Text style={styles.emptyText}>
                    Brak nowych zleceń z biura.
                  </Text>
                )}
                {zleceniaNowe.map((z) =>
                  renderZlecenieKarta(z, "#3b82f6", "Czeka na rozpoczęcie"),
                )}
              </View>
            )}
          </ScrollView>
          <CzatWidget
            idPracownika={idPracownika}
            nazwaPracownika={nazwaPracownika}
            rola={"krojcza_kierownik_szwalni"}
          />
        </View>

        <View style={styles.footerContainer}>
          <TouchableOpacity
            style={[
              styles.logoutButton,
              { backgroundColor: "#3b82f6", marginBottom: 10 },
            ]}
            onPress={() =>
              router.push({
                pathname: "/wybor-dzialu",
                params: { idPracownika, nazwaPracownika, rola },
              })
            }
          >
            <Text style={styles.buttonText}>🔄 ZMIEŃ DZIAŁ (ZASTĘPSTWO)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.buttonText}>ZAKOŃCZ ZMIANĘ (WYLOGUJ)</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: { alignItems: "center", marginBottom: 15 },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 14, color: "#f59e0b", fontWeight: "bold" },
  listWrapper: { flex: 1, width: "100%" },

  card: {
    width: "90%",
    maxWidth: 500,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 25,
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
    backgroundColor: "#f1f5f9",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 15,
    fontSize: 18,
    marginBottom: 15,
  },
  actionButton: {
    backgroundColor: "#f59e0b",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  actionButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
  divider: {
    marginVertical: 15,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  dividerText: {
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    color: "#94a3b8",
    position: "absolute",
    top: -10,
  },
  cameraButton: {
    backgroundColor: "#0ea5e9",
    padding: 15,
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
  listTextBold: { fontSize: 16, fontWeight: "bold", color: "#0f172a" },
  listTextSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  expandIcon: { fontSize: 18, color: "#94a3b8", paddingLeft: 10 },

  expandedContent: {
    backgroundColor: "#f8fafc",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  expandedTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#94a3b8",
    marginBottom: 12,
    textTransform: "uppercase",
  },

  pozycjaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
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
  checkboxText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  pozycjaNazwa: { fontSize: 14, color: "#0f172a", fontWeight: "bold" },
  pozycjaPrzekreslona: { color: "#94a3b8", textDecorationLine: "line-through" },
  pozycjaIlosc: { color: "#f59e0b" },
  pozycjaInstrukcja: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    fontStyle: "italic",
  },
  pozycjaInfoMagazyn: {
    fontSize: 11,
    color: "#ef4444",
    marginTop: 4,
    fontWeight: "bold",
  },
  emptyText: { color: "#94a3b8", paddingHorizontal: 20, fontStyle: "italic" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  qcModalContent: {
    width: "100%",
    maxWidth: 450,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 25,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    elevation: 10,
    maxHeight: "80%",
  },
  qcModalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 5,
    textAlign: "center",
  },
  qcModalSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 15,
    textAlign: "center",
  },
  qcItemsList: { maxHeight: 200, marginBottom: 20 },
  qcPozycjaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  qcPozycjaNazwa: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#334155",
    flex: 1,
  },
  qcPozycjaIlosc: { fontSize: 18, fontWeight: "900", color: "#0ea5e9" },
  qcActionButtonsRow: { flexDirection: "column", gap: 10 },
  qcDecisionBtn: { padding: 18, borderRadius: 12, alignItems: "center" },
  qcBtnReject: {
    backgroundColor: "#fef2f2",
    borderWidth: 2,
    borderColor: "#ef4444",
  },
  qcBtnApprove: { backgroundColor: "#10b981" },
  qcDecisionBtnText: { fontSize: 16, fontWeight: "900" },
  qcCancelBtn: { marginTop: 15, padding: 10, alignItems: "center" },
  qcCancelBtnText: { color: "#94a3b8", fontWeight: "bold" },
  qcUwagiInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
  },
  qcModalBtn: { paddingVertical: 15, borderRadius: 10 },

  footerContainer: {
    padding: 20,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
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
  managerButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 15,
    shadowOpacity: 0.1,
    elevation: 3,
  },
  managerButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "bold" },
});
