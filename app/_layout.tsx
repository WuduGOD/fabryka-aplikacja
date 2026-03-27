import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    // Stack to nawigacja, gdzie ekrany nakładają się na siebie (bez dolnego paska)
    <Stack screenOptions={{ headerShown: false }}>
      {/* headerShown: false ukrywa brzydki górny pasek z nazwą pliku */}
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
