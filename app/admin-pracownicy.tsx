import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import CzatWidget from "../components/CzatWidget";

export default function PracownicyScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>
        Moduł Kadr (W budowie)
      </Text>
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          marginTop: 20,
          padding: 15,
          backgroundColor: "#0f172a",
          borderRadius: 10,
        }}
      >
        <Text style={{ color: "white" }}>WRÓĆ DO MENU</Text>
      </TouchableOpacity>
      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"admin"}
      />
    </View>
  );
}
