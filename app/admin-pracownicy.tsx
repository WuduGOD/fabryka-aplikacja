import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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

const DOSTEPNE_ROLE = [
  { id: "krawcowa", nazwa: "🧵 Krawcowa" },
  { id: "krojcza_kierownik_szwalni", nazwa: "✂️ Krojcza / Kier. Szwalni" },
  { id: "ubieralnia", nazwa: "🛠️ Ubieralnia" },
  { id: "pikowanie", nazwa: "🪡 Pikowanie" },
  { id: "kontrola_jakosci", nazwa: "🔎 Kontrola Jakości" },
  { id: "magazyn", nazwa: "📦 Magazyn" },
  { id: "kierownik_produkcji", nazwa: "🗂️ Kierownik Produkcji" },
  { id: "biuro", nazwa: "💻 Biuro" },
  { id: "admin", nazwa: "⚙️ Administrator" },
  { id: "dyrektor", nazwa: "👔 Dyrektor" },
  { id: "szef", nazwa: "👑 Szef" },
];

export default function AdminPracownicyScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  const [pracownicy, setPracownicy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminIdFirmy, setAdminIdFirmy] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [edycjaId, setEdycjaId] = useState<string | null>(null);

  const [formNazwa, setFormNazwa] = useState("");
  const [formLogin, setFormLogin] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formRola, setFormRola] = useState("krawcowa");

  useEffect(() => {
    pobierzDanePoczatkowe();
  }, []);

  const pobierzDanePoczatkowe = async () => {
    setLoading(true);
    try {
      const adminId = Array.isArray(idPracownika)
        ? idPracownika[0]
        : idPracownika;
      let pobraneIdFirmy = null;

      if (adminId) {
        const { data: adminData } = await supabase
          .from("pracownicy")
          .select("id_firmy")
          .eq("id", adminId)
          .single();
        if (adminData) pobraneIdFirmy = adminData.id_firmy;
      }

      if (!pobraneIdFirmy) {
        const { data: fallbackData } = await supabase
          .from("pracownicy")
          .select("id_firmy")
          .eq("rola", "admin")
          .limit(1)
          .single();
        if (fallbackData) pobraneIdFirmy = fallbackData.id_firmy;
      }

      setAdminIdFirmy(pobraneIdFirmy);
      pobierzPracownikow();
    } catch (error) {
      console.error("Błąd pobierania danych:", error);
      setLoading(false);
    }
  };

  const pobierzPracownikow = async () => {
    const { data, error } = await supabase
      .from("pracownicy")
      .select("*")
      .order("czy_aktywny", { ascending: false })
      .order("nazwa_wyswietlana", { ascending: true });

    if (data) setPracownicy(data);
    setLoading(false);
  };

  const otworzModalDodawania = () => {
    setEdycjaId(null);
    setFormNazwa("");
    setFormLogin("");
    setFormPin("");
    setFormRola("krawcowa");
    setIsModalOpen(true);
  };

  const otworzModalEdycji = (pracownik: any) => {
    setEdycjaId(pracownik.id);
    setFormNazwa(pracownik.nazwa_wyswietlana || "");
    setFormLogin(pracownik.login || "");
    setFormPin("");
    setFormRola(pracownik.rola || "krawcowa");
    setIsModalOpen(true);
  };

  const zapiszPracownika = async () => {
    if (!formNazwa.trim() || !formLogin.trim()) {
      Alert.alert("Błąd", "Nazwa i Login są wymagane!");
      return;
    }

    if (
      (!edycjaId || formPin.trim() !== "") &&
      !/^\d{4}$/.test(formPin.trim())
    ) {
      Alert.alert("Błąd", "PIN musi składać się z dokładnie 4 cyfr!");
      return;
    }

    setLoading(true);

    try {
      // Czysty PIN (Nasza baza i Trigger zaszyfrują go automatycznie!)
      const hasloDoZapisu = formPin.trim();

      if (edycjaId) {
        const updateData: any = {
          nazwa_wyswietlana: formNazwa.trim(),
          login: formLogin.trim().toLowerCase(),
          rola: formRola,
        };

        if (formPin.trim() !== "") {
          updateData.pin_hash = hasloDoZapisu;
        }

        const { error } = await supabase
          .from("pracownicy")
          .update(updateData)
          .eq("id", edycjaId);

        if (error) {
          if (error.code === "23505")
            throw new Error("Taki login już istnieje w bazie!");
          throw error;
        }
        if (Platform.OS === "web")
          window.alert("Sukces: Zaktualizowano profil.");
        else Alert.alert("Sukces", "Zaktualizowano profil.");
      } else {
        if (!adminIdFirmy) throw new Error("Brak ID Firmy!");
        if (formPin.trim() === "")
          throw new Error("Nowy pracownik musi mieć PIN!");

        const { error } = await supabase.from("pracownicy").insert([
          {
            id_firmy: adminIdFirmy,
            nazwa_wyswietlana: formNazwa.trim(),
            login: formLogin.trim().toLowerCase(),
            pin_hash: hasloDoZapisu,
            rola: formRola,
            czy_aktywny: true,
          },
        ]);

        if (error) {
          if (error.code === "23505")
            throw new Error("Taki login już istnieje w bazie!");
          throw error;
        }

        if (Platform.OS === "web") window.alert("Sukces: Dodano pracownika.");
        else Alert.alert("Sukces", "Dodano pracownika.");
      }

      setIsModalOpen(false);
      pobierzPracownikow();
    } catch (err: any) {
      console.error("BŁĄD ZAPISU BAZY:", err);
      if (Platform.OS === "web") window.alert("Błąd: \n" + err.message);
      else Alert.alert("Błąd", err.message);
    } finally {
      setLoading(false);
    }
  };

  const przelaczStatus = async (id: string, obecnyStatus: boolean) => {
    const nowyStatus = !obecnyStatus;
    const { error } = await supabase
      .from("pracownicy")
      .update({ czy_aktywny: nowyStatus })
      .eq("id", id);

    if (error) Alert.alert("Błąd", "Nie udało się zmienić statusu.");
    else pobierzPracownikow();
  };

  const renderPracownik = ({ item }: { item: any }) => {
    const rolaFormat =
      DOSTEPNE_ROLE.find((r) => r.id === item.rola)?.nazwa ||
      item.rola.toUpperCase();
    const jestAktywny = item.czy_aktywny !== false;

    return (
      <View
        style={[
          styles.pracownikCard,
          !jestAktywny && styles.pracownikZwolniony,
        ]}
      >
        <View style={styles.pracownikInfo}>
          <Text
            style={[
              styles.pracownikNazwa,
              !jestAktywny && {
                color: "#94a3b8",
                textDecorationLine: "line-through",
              },
            ]}
          >
            {item.nazwa_wyswietlana}
          </Text>
          <View style={styles.pracownikMeta}>
            <Text style={styles.rolaBadge}>{rolaFormat}</Text>
            <Text style={styles.pinText}>Login: {item.login}</Text>
          </View>
        </View>

        <View style={styles.akcjeContainer}>
          <TouchableOpacity
            style={[styles.btnAkcja, { backgroundColor: "#3b82f6" }]}
            onPress={() => otworzModalEdycji(item)}
          >
            <Text style={styles.btnAkcjaText}>Edytuj</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btnAkcja,
              {
                backgroundColor: jestAktywny ? "#ef4444" : "#10b981",
                width: 90,
              },
            ]}
            onPress={() => przelaczStatus(item.id, jestAktywny)}
          >
            <Text style={styles.btnAkcjaText}>
              {jestAktywny ? "Zawieś" : "Aktywuj"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Panel Kadr (HR)</Text>
        <Text style={styles.subtitle}>Zarządzanie kontami i dostępem</Text>
      </View>

      <TouchableOpacity
        style={styles.dodajButton}
        onPress={otworzModalDodawania}
      >
        <Text style={styles.dodajButtonText}>➕ DODAJ NOWEGO PRACOWNIKA</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#0f172a"
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={pracownicy}
          keyExtractor={(item) => item.id}
          renderItem={renderPracownik}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Brak pracowników.</Text>
          }
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/admin")}
        >
          <Text style={styles.backButtonText}>WRÓĆ DO MENU ADMINA</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={isModalOpen} transparent={true} animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {edycjaId ? "Edycja Profilu" : "Nowy Pracownik"}
              </Text>

              <Text style={styles.label}>
                Imię i Nazwisko (Nazwa Wyświetlana)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="np. Jan Kowalski"
                value={formNazwa}
                onChangeText={setFormNazwa}
              />

              <Text style={styles.label}>Login do systemu</Text>
              <TextInput
                style={styles.input}
                placeholder="np. j.kowalski"
                value={formLogin}
                onChangeText={setFormLogin}
                autoCapitalize="none"
              />

              <Text style={styles.label}>
                {edycjaId
                  ? "Nowy PIN (zostaw puste by nie zmieniać)"
                  : "PIN logowania (4 cyfry)"}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="np. 1234"
                value={formPin}
                onChangeText={setFormPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry={true}
              />

              <Text style={styles.label}>Rola w systemie (Dział)</Text>
              <View style={styles.roleContainer}>
                {DOSTEPNE_ROLE.map((rola) => (
                  <TouchableOpacity
                    key={rola.id}
                    style={[
                      styles.rolaChip,
                      formRola === rola.id && styles.rolaChipAktywna,
                    ]}
                    onPress={() => setFormRola(rola.id)}
                  >
                    <Text
                      style={[
                        styles.rolaChipText,
                        formRola === rola.id && styles.rolaChipTextAktywna,
                      ]}
                    >
                      {rola.nazwa}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.zapiszBtn}
                onPress={zapiszPracownika}
              >
                <Text style={styles.zapiszBtnText}>ZAPISZ DANE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.anulujBtn}
                onPress={() => setIsModalOpen(false)}
              >
                <Text style={styles.anulujBtnText}>Anuluj</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"admin"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef2f6", paddingTop: 50 },
  header: { alignItems: "center", marginBottom: 20, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: "900", color: "#0f172a", marginBottom: 5 },
  subtitle: { fontSize: 16, color: "#64748b" },

  dodajButton: {
    backgroundColor: "#10b981",
    marginHorizontal: 20,
    marginBottom: 15,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#10b981",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dodajButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  listContainer: { paddingHorizontal: 20, paddingBottom: 120 },

  pracownikCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowOpacity: 0.05,
    elevation: 2,
    borderLeftWidth: 5,
    borderLeftColor: "#3b82f6",
  },
  pracownikZwolniony: {
    backgroundColor: "#f8fafc",
    borderLeftColor: "#94a3b8",
    opacity: 0.7,
  },
  pracownikInfo: { flex: 1, marginRight: 10 },
  pracownikNazwa: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 5,
  },
  pracownikMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  rolaBadge: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pinText: { fontSize: 13, color: "#64748b", fontWeight: "bold" },

  akcjeContainer: { flexDirection: "row", gap: 8 },
  btnAkcja: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAkcjaText: { color: "#fff", fontSize: 13, fontWeight: "bold" },

  emptyText: {
    textAlign: "center",
    color: "#64748b",
    marginTop: 40,
    fontSize: 16,
  },

  footer: { padding: 20, alignItems: "center", backgroundColor: "#eef2f6" },
  backButton: {
    backgroundColor: "#1e293b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  backButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 450,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 25,
    shadowOpacity: 0.2,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 20,
    textAlign: "center",
  },

  label: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 5,
    marginLeft: 5,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    color: "#0f172a",
  },

  roleContainer: { flexDirection: "row", flexWrap: "wrap", marginBottom: 25 },
  rolaChip: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
    justifyContent: "center",
  },
  rolaChipAktywna: { backgroundColor: "#eff6ff", borderColor: "#3b82f6" },
  rolaChipText: { color: "#64748b", fontWeight: "bold" },
  rolaChipTextAktywna: { color: "#2563eb" },

  zapiszBtn: {
    backgroundColor: "#10b981",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  zapiszBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  anulujBtn: {
    backgroundColor: "#f1f5f9",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  anulujBtnText: { color: "#64748b", fontSize: 14, fontWeight: "bold" },
});
