import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function DashboardScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  // useRef działa jak natychmiastowy bezpiecznik (nie czeka na odświeżenie ekranu)
  const isProcessing = useRef(false);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    // 1. Jeśli bezpiecznik jest włączony (już coś przetwarzamy) - zignoruj skan!
    if (isProcessing.current) return;

    // 2. Natychmiast włącz bezpiecznik dla kolejnych skanów
    isProcessing.current = true;

    Alert.alert("Zeskanowano Zlecenie", `Treść kodu: ${data}`, [
      {
        text: "OK",
        onPress: () => {
          // 3. Wyłącz bezpiecznik i pozwól skanować dalej DOPIERO po kliknięciu OK
          // Dajemy też minimalne opóźnienie (pół sekundy), żeby pracownik zdążył zabrać rękę z kodem
          setTimeout(() => {
            isProcessing.current = false;
          }, 500);
        },
      },
    ]);
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Uruchamianie skanera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>
          Aplikacja potrzebuje dostępu do aparatu.
        </Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={requestPermission}
        >
          <Text style={styles.buttonText}>UDZIEL DOSTĘPU</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Usunęliśmy warunek w onBarcodeScanned, teraz nasza funkcja sama pilnuje blokady */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
      />

      <View style={styles.overlayTop}>
        <Text style={styles.overlayText}>
          Nakieruj aparat na kod QR Zlecenia
        </Text>
      </View>

      <View style={styles.overlayBottom}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.buttonText}>WYLOGUJ SIĘ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    marginBottom: 20,
    textAlign: "center",
    padding: 20,
  },
  actionButton: {
    backgroundColor: "#0ea5e9",
    padding: 15,
    borderRadius: 12,
    width: "80%",
    alignItems: "center",
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
  overlayTop: {
    position: "absolute",
    top: 50,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  overlayText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  overlayBottom: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
});
