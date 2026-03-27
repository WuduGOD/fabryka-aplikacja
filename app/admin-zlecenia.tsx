import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

export default function AdminDodajZlecenieScreen() {
  const router = useRouter();
  const [kodZlecenia, setKodZlecenia] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [tymczasowyKod, setTymczasowyKod] = useState("");

  const isProcessing = useRef(false);
  const webScannerRef = useRef<any>(null); // Referencja do zamknięcia kamery na PC
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  // --- NAJPOTĘŻNIEJSZY SILNIK SKANERA WEBOWEGO (QR-SCANNER + WEB WORKERS) ---
  useEffect(() => {
    if (Platform.OS === "web" && isCameraOpen) {
      let qrScanner: any = null;

      import("qr-scanner").then((module) => {
        const QrScanner = module.default;
        const videoElement = webScannerRef.current;

        if (!videoElement) return;

        qrScanner = new QrScanner(
          videoElement,
          (result) => {
            const data = typeof result === "string" ? result : result.data;
            if (qrScanner) {
              qrScanner.stop();
              qrScanner.destroy();
            }
            handleCameraScan({ data });
          },
          {
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
          },
        );

        qrScanner.start().catch((err: any) => {
          console.log("Błąd uruchamiania kamery:", err);
        });
      });

      return () => {
        if (qrScanner) {
          qrScanner.stop();
          qrScanner.destroy();
        }
      };
    }
  }, [isCameraOpen]);

  const handleWpisanoRecznie = () => {
    if (!kodZlecenia || !kodZlecenia.trim()) {
      Alert.alert("Błąd", "Wpisz numer ZD.");
      return;
    }
    Keyboard.dismiss();
    setTymczasowyKod(kodZlecenia);
    setShowModal(true);
  };

  const handleCameraScan = ({ data }: { data: any }) => {
    // 1. Zabezpieczenie przed podwójnym skanem
    if (isProcessing.current) return;
    isProcessing.current = true;

    // 2. Wymuszamy, żeby dane zawsze były tekstem (brutalna konwersja)
    const bezpieczneDane = String(data);

    // TEST DIAGNOSTYCZNY: Wyświetli nam surowy tekst prosto z kodu QR!
    if (Platform.OS === "web") {
      window.alert("Odczytano z QR: \n" + bezpieczneDane);
    } else {
      Alert.alert("Odczytano z QR:", bezpieczneDane);
    }

    // 3. Zamykamy kamerę
    setIsCameraOpen(false);

    // 4. Jeśli mamy tekst, wyświetlamy Modal (wydłużony czas na przeładowanie widoku)
    if (
      bezpieczneDane &&
      bezpieczneDane.trim() !== "" &&
      bezpieczneDane !== "undefined"
    ) {
      setTymczasowyKod(bezpieczneDane.trim());

      setTimeout(() => {
        setShowModal(true);
        isProcessing.current = false;
      }, 500); // 500ms (pół sekundy) to bezpieczny bufor dla przeglądarki
    } else {
      isProcessing.current = false;
    }
  };

  const zapiszZlecenieDoBazy = async (docelowyStatus: string) => {
    setShowModal(false);
    try {
      const czesci = tymczasowyKod.split("^");
      const numerZD = czesci[0].trim();
      const produkty = czesci.slice(1).filter((p) => p.trim() !== "");

      // ZMIANA 1: Pobieramy profil admina, a nie biura
      const { data: profilAdmina, error: errProfil } = await supabase
        .from("pracownicy")
        .select("id, id_firmy")
        .eq("rola", "admin")
        .limit(1)
        .single();

      if (!profilAdmina) {
        Alert.alert("Błąd", "Nie znaleziono profilu administratora.");
        return;
      }

      const { data: noweZlecenie, error: errZlecenie } = await supabase
        .from("zlecenia")
        .insert([
          {
            numer_zd: numerZD,
            id_firmy: profilAdmina.id_firmy,
            id_zlecajacego: profilAdmina.id,
            status: docelowyStatus,
          },
        ])
        .select()
        .single();

      if (errZlecenie) {
        if (errZlecenie.code === "23505")
          Alert.alert("Uwaga", "To zlecenie jest już w systemie!");
        else Alert.alert("Błąd zapisu zlecenia", errZlecenie.message);
        return;
      }

      if (produkty.length > 0 && noweZlecenie) {
        const pozycjeDoWstawienia = produkty.map((prod) => {
          const detale = prod.split("|");
          return {
            id_zlecenia: noweZlecenie.id,
            id_firmy: profilAdmina.id_firmy,
            symbol: detale[0] ? detale[0].trim() : "Brak symbolu",
            nazwa: detale[1] ? detale[1].trim() : "Brak nazwy",
            ilosc: parseInt(detale[2]) || 1,
            instrukcje: detale[3] ? detale[3].trim() : "",
          };
        });

        const { error: errPozycje } = await supabase
          .from("pozycje_zlecenia")
          .insert(pozycjeDoWstawienia);
        if (errPozycje) {
          Alert.alert("Błąd zapisu pozycji", errPozycje.message);
          return;
        }
      }

      Alert.alert(
        "Sukces!",
        `Wysłano Zlecenie (Admin): ${numerZD}\nKierunek: ${docelowyStatus === "oczekuje_kierownik" ? "Kierownik Produkcji" : "Krojownia"}`,
      );
      setKodZlecenia("");
      setTymczasowyKod("");
    } catch (err: any) {
      Alert.alert("Błąd krytyczny", err.message);
    }
  };

  const handleOtworzKamere = async () => {
    if (Platform.OS !== "web") {
      if (!permission?.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert("Błąd", "Brak uprawnień do kamery.");
          return;
        }
      }
    }
    isProcessing.current = false;
    setIsCameraOpen(true);
  };

  // --- WIDOK KAMERY (PODZIAŁ WEB VS NATIVE) ---
  if (isCameraOpen) {
    if (Platform.OS === "web") {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: "#eef2f6",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
              marginBottom: 15,
              color: "#0f172a",
            }}
          >
            Skieruj aparat na kod QR
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#64748b",
              marginBottom: 25,
              textAlign: "center",
            }}
          >
            Upewnij się, że kod jest dobrze oświetlony i znajduje się w ramce.
          </Text>
          <View
            style={{
              width: "100%",
              maxWidth: 500,
              backgroundColor: "white",
              padding: 15,
              borderRadius: 16,
              elevation: 5,
            }}
          >
            {/* Wymagany czysty tag <video> dla biblioteki Nimiq */}
            {React.createElement("video", {
              ref: webScannerRef,
              style: { width: "100%", minHeight: 300, objectFit: "cover" },
              playsInline: true,
              muted: true,
            })}
          </View>
          <TouchableOpacity
            style={[
              styles.closeCameraButton,
              { position: "relative", bottom: 0, marginTop: 30 },
            ]}
            onPress={() => setIsCameraOpen(false)}
          >
            <Text style={styles.buttonText}>ANULUJ SKANOWANIE</Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      return (
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={handleCameraScan}
          />
          <View style={styles.overlayTop}>
            <Text style={styles.overlayText}>Skanowanie ZD z Subiekta</Text>
          </View>
          <TouchableOpacity
            style={styles.closeCameraButton}
            onPress={() => setIsCameraOpen(false)}
          >
            <Text style={styles.buttonText}>ANULUJ</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  // --- GŁÓWNY WIDOK EKRANU ---
  return (
    <TouchableWithoutFeedback
      onPress={() => {
        if (Platform.OS !== "web") Keyboard.dismiss();
      }}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Wprowadzanie Zleceń</Text>
          {/* ZMIANA 2: Tekst na Admin */}
          <Text style={styles.subtitle}>Skanuj i przydzielaj ZD (Admin)</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>WPISZ RĘCZNIE LUB UŻYJ SKANERA USB:</Text>
          <TextInput
            style={styles.input}
            placeholder="Numer ZD..."
            value={kodZlecenia}
            onChangeText={setKodZlecenia}
            onSubmitEditing={handleWpisanoRecznie}
          />
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleWpisanoRecznie}
          >
            <Text style={styles.actionButtonText}>DALEJ</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <Text style={styles.dividerText}>LUB</Text>
          </View>
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={handleOtworzKamere}
          >
            <Text style={styles.cameraButtonText}>
              📸 WŁĄCZ KAMERĘ / SKANER
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.backButton}
          // ZMIANA 3: Twardy powrót na panel admina
          onPress={() => router.replace("/admin")}
        >
          <Text style={styles.buttonText}>WRÓĆ DO MENU ADMINA</Text>
        </TouchableOpacity>

        <Modal visible={showModal} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Gdzie wysłać ZD?</Text>
              <Text style={styles.modalSubtitle}>
                Wybierz dział dla tego zlecenia:
              </Text>

              <TouchableOpacity
                style={[styles.routeBtn, { backgroundColor: "#3b82f6" }]}
                onPress={() => zapiszZlecenieDoBazy("oczekuje_kierownik")}
              >
                <Text style={styles.routeBtnIcon}>🗂️</Text>
                <View>
                  <Text style={styles.routeBtnTitle}>Kierownik Produkcji</Text>
                  <Text style={styles.routeBtnDesc}>
                    Towar ze sklepu / Sprawdź regał
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.routeBtn, { backgroundColor: "#10b981" }]}
                onPress={() => zapiszZlecenieDoBazy("oczekuje_krojownia")}
              >
                <Text style={styles.routeBtnIcon}>✂️</Text>
                <View>
                  <Text style={styles.routeBtnTitle}>Krojownia & Szwalnia</Text>
                  <Text style={styles.routeBtnDesc}>
                    Szyjemy od zera / Uzupełnienie
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.routeBtn, { backgroundColor: "#94a3b8" }]}
                disabled={true}
              >
                <Text style={styles.routeBtnIcon}>📦</Text>
                <View>
                  <Text style={styles.routeBtnTitle}>Magazyn (Wkrótce)</Text>
                  <Text style={styles.routeBtnDesc}>
                    Przycisk tymczasowo zablokowany
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
            <CzatWidget
              idPracownika={idPracownika}
              nazwaPracownika={nazwaPracownika}
              rola={"admin"}
            />
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 20,
    paddingTop: 60,
  },
  header: { alignItems: "center", marginBottom: 40 },
  title: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 16, color: "#2563eb", fontWeight: "bold" },
  card: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 30,
    shadowOpacity: 0.1,
    elevation: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 18,
    fontSize: 20,
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: "#0f172a",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  actionButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
  divider: {
    marginVertical: 20,
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
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  cameraButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
  backButton: {
    backgroundColor: "#1e293b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
    marginTop: 40,
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
  overlayText: { color: "white", textAlign: "center", fontWeight: "bold" },
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 25,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 5,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 20,
  },
  routeBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
  },
  routeBtnIcon: { fontSize: 28, marginRight: 15 },
  routeBtnTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  routeBtnDesc: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  modalCancel: { marginTop: 10, padding: 15, alignItems: "center" },
  modalCancelText: { color: "#64748b", fontSize: 16, fontWeight: "bold" },
});
