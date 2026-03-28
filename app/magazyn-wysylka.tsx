import { CameraView, useCameraPermissions } from "expo-camera";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SyncManager } from "../components/SyncManager";
import { supabase } from "../supabase";

export default function MagazynWysylkaScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika, rola } = useLocalSearchParams();

  const [kodZlecenia, setKodZlecenia] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const isProcessing = useRef(false);

  const [zleceniaDoWysylki, setZleceniaDoWysylki] = useState<any[]>([]);
  const [pozycje, setPozycje] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- STANY OFFLINE ---
  const [isOnline, setIsOnline] = useState(true);
  const [zalegleSkany, setZalegleSkany] = useState(0);

  // Modal do wyboru sposobu wysyłki
  const [isWysylkaModalVisible, setIsWysylkaModalVisible] = useState(false);
  const [zlecenieDoWysylki, setZlecenieDoWysylki] = useState<any>(null);

  const fetchZlecenia = async (cicheOdswiezanie = false) => {
    if (!cicheOdswiezanie) setLoading(true);
    try {
      const { data: zleceniaData } = await supabase
        .from("zlecenia")
        .select("*")
        .eq("status", "do_wysylki")
        .order("utworzono", { ascending: true });

      if (zleceniaData) {
        setZleceniaDoWysylki(zleceniaData);

        const zleceniaIds = zleceniaData.map((z) => z.id);
        if (zleceniaIds.length > 0) {
          // UWAGA: Magazynier widzi WSZYSTKO (bez filtra czy_z_regalu), bo musi spakować też Matę Tatami!
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

    // --- CZUJNIK OFFLINE ---
    const netInterval = setInterval(async () => {
      const netInfo = await Network.getNetworkStateAsync();
      setIsOnline(!!(netInfo.isConnected && netInfo.isInternetReachable));
      setZalegleSkany(await SyncManager.pobierzIloscWklejce());
    }, 3000);

    const subskrypcja = supabase
      .channel("zmiany_magazyn")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zlecenia" },
        () => fetchZlecenia(true),
      )
      .subscribe();

    return () => {
      clearInterval(netInterval);
      supabase.removeChannel(subskrypcja);
    };
  }, []);

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

      // Szukanie LOKALNIE
      const znalezioneZlecenie = zleceniaDoWysylki.find(
        (z) => z.numer_zd === numerZD,
      );

      if (znalezioneZlecenie) {
        setExpandedId(znalezioneZlecenie.id);
      } else {
        if (isOnline) {
          // Jeśli jest internet, upewnijmy się jaki to ma status w bazie
          const { data: zlecenie } = await supabase
            .from("zlecenia")
            .select("*")
            .eq("numer_zd", numerZD)
            .single();
          if (!zlecenie) {
            Alert.alert("Błąd", `Nie znaleziono ZD: ${numerZD}`);
          } else {
            Alert.alert(
              "Informacja",
              `To ZD ma status: ${zlecenie.status}. Nie jest jeszcze na wysyłce!`,
            );
          }
        } else {
          Alert.alert(
            "Tryb Offline",
            `Zlecenie ${numerZD} nie znajduje się na liście "Do wysyłki". Włącz internet, by sprawdzić bazę.`,
          );
        }
      }

      setKodZlecenia("");
      setIsCameraOpen(false);
      Keyboard.dismiss();
    } catch (err) {
      Alert.alert("Błąd aplikacji.");
    } finally {
      setLoading(false);
      setTimeout(() => {
        isProcessing.current = false;
      }, 1000);
    }
  };

  const otworzModalWysylki = (zlecenie: any) => {
    setZlecenieDoWysylki(zlecenie);
    setIsWysylkaModalVisible(true);
  };

  const finalizujWysylke = async (sposob: string) => {
    if (!zlecenieDoWysylki) return;
    setLoading(true);
    setIsWysylkaModalVisible(false);

    try {
      if (isOnline) {
        // ONLINE: Ostateczne zamknięcie zlecenia!
        await supabase
          .from("zlecenia")
          .update({
            status: "zrealizowane",
            sposob_wysylki: sposob,
          })
          .eq("id", zlecenieDoWysylki.id);

        await supabase.from("historia_statusow").insert([
          {
            id_zlecenia: zlecenieDoWysylki.id,
            id_pracownika: idPracownika,
            id_firmy: zlecenieDoWysylki.id_firmy,
            stary_status: "do_wysylki",
            nowy_status: "zrealizowane",
          },
        ]);

        if (Platform.OS === "web") {
          window.alert(
            `✅ ZD ${zlecenieDoWysylki.numer_zd} wysłane jako: ${sposob}`,
          );
        } else {
          Alert.alert("Sukces!", `Wysłano jako: ${sposob}`);
        }
      } else {
        // OFFLINE: Przechwytywane przez Kuriera
        await SyncManager.dodajDoKolejki(
          "zlecenia",
          "UPDATE",
          { status: "zrealizowane", sposob_wysylki: sposob },
          zlecenieDoWysylki.id,
        );
        await SyncManager.dodajDoKolejki("historia_statusow", "INSERT", {
          id_zlecenia: zlecenieDoWysylki.id,
          id_pracownika: idPracownika,
          id_firmy: zlecenieDoWysylki.id_firmy,
          stary_status: "do_wysylki",
          nowy_status: "zrealizowane",
        });

        if (Platform.OS === "web") {
          window.alert(`✅ Zapisano offline: ${sposob}`);
        } else {
          Alert.alert("Tryb Offline", `Zapisano jako: ${sposob}`);
        }

        // Optymistycznie usuwamy z ekranu
        setZleceniaDoWysylki((prev) =>
          prev.filter((z) => z.id !== zlecenieDoWysylki.id),
        );
      }

      setExpandedId(null);
      if (isOnline) fetchZlecenia(true);
    } catch (e) {
      Alert.alert("Błąd przy zapisie wysyłki.");
    } finally {
      setLoading(false);
      setZlecenieDoWysylki(null);
    }
  };

  const renderZlecenie = (z: any) => {
    const isExpanded = expandedId === z.id;
    const produktyZlecenia = pozycje.filter((p) => p.id_zlecenia === z.id);

    return (
      <View
        key={z.id}
        style={[styles.listItem, { borderLeftColor: "#8b5cf6" }]}
      >
        <TouchableOpacity
          style={styles.listHeader}
          onPress={() => setExpandedId(isExpanded ? null : z.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.listTextBold}>{z.numer_zd}</Text>
            <Text
              style={[
                styles.listTextSub,
                { color: "#8b5cf6", fontWeight: "bold" },
              ]}
            >
              Gotowe do spakowania
            </Text>
          </View>
          <Text style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.kompletacjaHeader}>
              📦 LISTA KOMPLETACJI (SPAKUJ WSZYSTKO):
            </Text>

            {produktyZlecenia.map((prod) => (
              <View
                key={prod.id}
                style={[
                  styles.pozycjaRow,
                  prod.czy_z_regalu && styles.pozycjaZRegalu,
                ]}
              >
                <View style={styles.pozycjaTopRow}>
                  <Text style={styles.pozycjaNazwa}>{prod.nazwa}</Text>
                  <Text style={styles.pozycjaDuzaIlosc}>
                    {prod.ilosc ?? 1} szt.
                  </Text>
                </View>
                {prod.czy_z_regalu ? (
                  <Text style={styles.uwagaRegal}>
                    ⚠️ POBIERZ Z MAGAZYNU / REGAŁU (Gotowiec)
                  </Text>
                ) : (
                  <Text style={styles.uwagaProdukcja}>
                    ✅ PRZYJECHAŁO Z PRODUKCJI (Na wózku)
                  </Text>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={styles.endCartButton}
              onPress={() => otworzModalWysylki(z)}
            >
              <Text style={styles.endCartButtonText}>
                🚀 NADAJ PRZESYŁKĘ I ZAKOŃCZ
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isCameraOpen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
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
          <Text style={styles.overlayText}>Zeskanuj Kod ZD</Text>
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#faf5ff" }}>
      {/* Pasek Offline na samej górze */}
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
              Oczekujące wysyłki w schowku: {zalegleSkany}
            </Text>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={[styles.container, !isOnline && { paddingTop: 10 }]} // Mniejszy odstęp jak jest pasek błędu
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* MODAL WYBORU WYSYŁKI */}
        <Modal
          visible={isWysylkaModalVisible}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Jak wysyłasz {zlecenieDoWysylki?.numer_zd}?
              </Text>

              <TouchableOpacity
                style={[
                  styles.modalOptionBtn,
                  {
                    backgroundColor: "#e0f2fe",
                    borderColor: "#38bdf8",
                    borderWidth: 2,
                  },
                ]}
                onPress={() => finalizujWysylke("KURIER / PACZKA")}
              >
                <Text style={[styles.modalOptionText, { color: "#0369a1" }]}>
                  📦 KURIER / PACZKA (Detal)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalOptionBtn,
                  {
                    backgroundColor: "#fef3c7",
                    borderColor: "#fbbf24",
                    borderWidth: 2,
                  },
                ]}
                onPress={() => finalizujWysylke("PALETA")}
              >
                <Text style={[styles.modalOptionText, { color: "#b45309" }]}>
                  🪵 PALETA (Hurt/Zagranica)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalOptionBtn,
                  {
                    backgroundColor: "#f3f4f6",
                    borderColor: "#9ca3af",
                    borderWidth: 2,
                  },
                ]}
                onPress={() => finalizujWysylke("TIR / LUZEM")}
              >
                <Text style={[styles.modalOptionText, { color: "#374151" }]}>
                  🚛 TIR / LUZEM (Duży hurt)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsWysylkaModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>ANULUJ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={styles.header}>
          <Text style={styles.title}>Panel Wysyłki (Magazyn)</Text>
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
                colors={["#8b5cf6"]}
              />
            }
          >
            <View style={styles.card}>
              <Text style={styles.label}>ZESKANUJ ZD DO SPAKOWANIA:</Text>
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

            {!loading && (
              <View style={{ width: "100%", maxWidth: 500 }}>
                <Text style={[styles.sectionHeader, { marginTop: 10 }]}>
                  📋 DO SPAKOWANIA I WYSŁANIA ({zleceniaDoWysylki.length}):
                </Text>
                {zleceniaDoWysylki.length === 0 && (
                  <Text style={styles.emptyText}>Brak wózków do wysyłki.</Text>
                )}
                {zleceniaDoWysylki.map((z) => renderZlecenie(z))}
              </View>
            )}
          </ScrollView>
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
  container: { flex: 1, backgroundColor: "#faf5ff", paddingTop: 50 },
  header: { alignItems: "center", marginBottom: 15 },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 14, color: "#8b5cf6", fontWeight: "bold" },
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
    backgroundColor: "#faf5ff",
    borderWidth: 2,
    borderColor: "#ddd6fe",
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
  expandedContent: {
    backgroundColor: "#f8fafc",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  kompletacjaHeader: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#475569",
    marginBottom: 10,
  },
  pozycjaRow: {
    marginBottom: 10,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pozycjaZRegalu: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
    borderWidth: 2,
  },
  pozycjaTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  pozycjaNazwa: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    flex: 1,
    paddingRight: 10,
  },
  pozycjaDuzaIlosc: {
    fontSize: 20,
    fontWeight: "900",
    color: "#8b5cf6",
    backgroundColor: "#ede9fe",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: "hidden",
  },
  uwagaProdukcja: {
    fontSize: 12,
    color: "#10b981",
    fontWeight: "bold",
    marginTop: 5,
  },
  uwagaRegal: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "bold",
    marginTop: 5,
  },
  endCartButton: {
    backgroundColor: "#8b5cf6",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
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
    width: "90%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 25,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 20,
    textAlign: "center",
  },
  modalOptionBtn: {
    paddingVertical: 18,
    borderRadius: 12,
    marginBottom: 15,
    alignItems: "center",
  },
  modalOptionText: { fontSize: 16, fontWeight: "900" },
  modalCancelBtn: {
    marginTop: 10,
    backgroundColor: "#f1f5f9",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCancelText: { color: "#64748b", fontWeight: "bold", fontSize: 14 },
  footerContainer: {
    padding: 20,
    backgroundColor: "#faf5ff",
    borderTopWidth: 1,
    borderTopColor: "#ddd6fe",
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
});
