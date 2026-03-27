import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

export default function LoginScreen() {
  const [login, setLogin] = useState("");
  const [pin, setPin] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    if (!login || !pin) {
      Alert.alert("Błąd", "Proszę podać login i PIN.");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("autoryzuj_pracownika", {
        p_login: login.toLowerCase(),
        p_pin: pin,
      });

      if (error) {
        Alert.alert("Błąd serwera", error.message);
      } else if (data && data.length > 0) {
        const user = data[0];

        // BRAMKARZ: Segregacja po rolach wprost z Twojej bazy danych
        if (user.rola === "admin" || user.rola === "kierownik") {
          // Szefostwo idzie do biura
          router.replace({
            pathname: "/admin",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "dyrektor") {
          // NOWE: Dyrektor ma swój własny Hub
          router.replace("/panel-dyrektor");
        } else if (user.rola === "szef") {
          // NOWE: Przekierowanie do dedykowanego Panelu Szefa
          router.replace({
            pathname: "/panel-szef",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "kierownik_produkcji") {
          // NOWE: Przekierowanie do dedykowanego Panelu Szefa
          router.replace({
            pathname: "/kierownik-panel",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "biuro") {
          // NOWE: Pracownicy biurowi idą do dedykowanego Panelu Biurowego
          router.replace({
            pathname: "/panel-biuro",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "ubieralnia") {
          // Pracownicy Ubieralni idą do swojego panelu montażu
          router.replace({
            pathname: "/hala-ubieralnia",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "pikowanie") {
          router.replace({
            pathname: "/hala-pikowanie",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "magazyn") {
          router.replace({
            pathname: "/magazyn-wysylka",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "krojcza_kierownik_szwalni") {
          // Krojcza idzie do Krojowni (pierwszy etap)
          router.replace({
            pathname: "/hala-krojownia",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else {
          // Krawcowe / Szwaczki idą do Szwalni (drugi etap - stworzymy ten ekran za chwilę)
          router.replace({
            pathname: "/hala-szwalnia",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        }
      } else {
        Alert.alert("Odmowa dostępu", "Nieprawidłowy login lub PIN.");
      }
    } catch (err) {
      Alert.alert("Błąd", "Problem z połączeniem z bazą danych.");
    }
  };
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.backgroundShape} />
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.logoText}>PASCALL</Text>
          <Text style={styles.subtitleText}>System Produkcyjny</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>ID Pracownika</Text>
          <TextInput
            style={styles.input}
            placeholder="np. krawcowa01"
            placeholderTextColor="#9ca3af"
            value={login}
            onChangeText={setLogin}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Kod PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="••••"
            placeholderTextColor="#9ca3af"
            secureTextEntry={true}
            keyboardType="numeric"
            value={pin}
            onChangeText={setPin}
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>ZALOGUJ SIĘ</Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>© 2026 Pascall</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef2f6",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  backgroundShape: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  header: { alignItems: "center", marginBottom: 40 },
  logoText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#0f172a",
  },
  button: {
    backgroundColor: "#0ea5e9",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  footerText: {
    textAlign: "center",
    marginTop: 24,
    fontSize: 12,
    color: "#94a3b8",
  },
});
