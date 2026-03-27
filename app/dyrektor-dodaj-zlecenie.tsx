import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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

export default function BiuroDodajZlecenieScreen() {
  const router = useRouter();
  const [kodZlecenia, setKodZlecenia] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const isProcessing = useRef(false);
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  const handleDodajZlecenie = async (zeskanowanyKod?: string) => {
    const kodRaw =
      typeof zeskanowanyKod === "string" ? zeskanowanyKod : kodZlecenia;

    if (!kodRaw || !kodRaw.trim()) {
      setIsCameraOpen(false); // <--- ZAMYKAMY APARAT
      Alert.alert("Błąd", "Brak danych do przetworzenia.");
      isProcessing.current = false;
      return;
    }

    try {
      const czesci = kodRaw.split("^");
      const numerZD = czesci[0].trim();
      const produkty = czesci.slice(1).filter((p) => p.trim() !== "");

      // POBRANIE PROFILU (Upewnij się, że masz tu odpowiednią rolę dla pliku, w którym to wklejasz: admin, biuro lub dyrektor!)
      const { data: profil, error: errProfil } = await supabase
        .from("pracownicy")
        .select("id, id_firmy")
        .eq("rola", "dyrektor") // <--- TUTAJ ZMIEŃ NA "admin" LUB "dyrektor" W ZALEŻNOŚCI OD PLIKU
        .limit(1)
        .single();

      if (!profil) {
        setIsCameraOpen(false); // <--- ZAMYKAMY APARAT
        Alert.alert("Błąd", "Nie znaleziono profilu w bazie danych.");
        isProcessing.current = false;
        return;
      }

      const { data: noweZlecenie, error: errZlecenie } = await supabase
        .from("zlecenia")
        .insert([
          {
            numer_zd: numerZD,
            id_firmy: profil.id_firmy,
            id_zlecajacego: profil.id,
            status: "nowe",
          },
        ])
        .select()
        .single();

      if (errZlecenie) {
        setIsCameraOpen(false); // <--- ZAMYKAMY APARAT ZANIM WYSKOCZY ALERT (To zapobiega klonowaniu okienek!)

        if (errZlecenie.code === "23505") {
          Alert.alert("Uwaga", "To zlecenie jest już na produkcji!");
        } else {
          Alert.alert("Błąd zapisu zlecenia", errZlecenie.message);
        }
        isProcessing.current = false;
        return;
      }

      if (produkty.length > 0 && noweZlecenie) {
        const pozycjeDoWstawienia = produkty.map((prod) => {
          const detale = prod.split("|");
          return {
            id_zlecenia: noweZlecenie.id,
            id_firmy: profil.id_firmy,
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
          setIsCameraOpen(false); // <--- ZAMYKAMY APARAT
          Alert.alert("Błąd zapisu pozycji", errPozycje.message);
          isProcessing.current = false;
          return;
        }
      }

      setIsCameraOpen(false); // <--- ZAMYKAMY APARAT PO SUKCESIE
      Alert.alert(
        "Sukces!",
        `Dodano Zlecenie: ${numerZD}\nLiczba pozycji do uszycia: ${produkty.length}`,
      );
      setKodZlecenia("");
      Keyboard.dismiss();
    } catch (err: any) {
      setIsCameraOpen(false); // <--- ZAMYKAMY APARAT PRZY KRYTYCZNYM BŁĘDZIE
      Alert.alert(
        "Błąd krytyczny",
        err.message || "Aplikacja napotkała nieznany problem.",
      );
    } finally {
      // Aparat jest już na 100% zamknięty, więc odblokowujemy system
      setTimeout(() => {
        isProcessing.current = false;
      }, 1000);
    }
  };

  const handleCameraScan = ({ data }: { data: string }) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    handleDodajZlecenie(data);
  };

  const handleOtworzKamere = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert("Błąd", "Brak uprawnień do kamery.");
        return;
      }
    }
    isProcessing.current = false;
    setIsCameraOpen(true);
  };

  if (isCameraOpen) {
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

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Wprowadzanie Zleceń</Text>
          <Text style={styles.subtitle}>
            Dodaj nowy numer ZD do bazy (Biuro)
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>WPISZ RĘCZNIE LUB UŻYJ SKANERA USB:</Text>
          <TextInput
            style={styles.input}
            placeholder="Numer ZD..."
            value={kodZlecenia}
            onChangeText={setKodZlecenia}
            onSubmitEditing={() => handleDodajZlecenie()}
          />
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDodajZlecenie()}
          >
            <Text style={styles.actionButtonText}>DODAJ DO BAZY</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <Text style={styles.dividerText}>LUB</Text>
          </View>
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={handleOtworzKamere}
          >
            <Text style={styles.cameraButtonText}>📸 SKANUJ TELEFONEM</Text>
          </TouchableOpacity>
          <CzatWidget
            idPracownika={idPracownika}
            nazwaPracownika={nazwaPracownika}
            rola={"dyrektor"}
          />
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>WRÓĆ DO MENU</Text>
        </TouchableOpacity>
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
    backgroundColor: "#10b981",
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
});
