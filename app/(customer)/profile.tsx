import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { buildExportFile, deleteMyAccount, exportMyData, updateMyProfile } from "../../src/features/account/api";
import { saveExportFile } from "../../src/features/account/export-file";
import { signOut } from "../../src/features/auth/api";
import { listMyCustomers } from "../../src/features/customers/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, supabase } = useSupabaseSession();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const customer = customers.data?.[0];
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const fail = (caught: unknown, fallback: string) =>
    setFeedback({ message: caught instanceof Error ? caught.message : fallback, variant: "error" });

  useEffect(() => {
    if (customer) {
      setFullName(customer.fullName);
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  const save = useMutation({
    mutationFn: () => updateMyProfile(supabase, { fullName, phone: phone.trim() || null }),
    onError: (caught) => fail(caught, "Unable to save your profile."),
    onSuccess: () => {
      setFeedback({ message: "Profile saved.", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-customers"] });
    },
  });
  const exportData = useMutation({
    mutationFn: async () => saveExportFile(buildExportFile(await exportMyData(supabase))),
    onError: (caught) => fail(caught, "Unable to export your data."),
    onSuccess: () => setFeedback({ message: "Your data export is ready.", variant: "success" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await deleteMyAccount(supabase);
      await supabase.auth.signOut().catch(() => undefined);
    },
    onSuccess: () => queryClient.clear(),
    onError: (caught) => {
      setConfirmingDelete(false);
      fail(caught, "Unable to delete your account.");
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Profile</Text>
            <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
            <Input label="Full name" onChangeText={setFullName} testID="profile-name" value={fullName} />
            <Input label="Phone (optional)" onChangeText={setPhone} testID="profile-phone" value={phone} />
            <Button disabled={save.isPending || !customer} label="Save changes" onPress={() => save.mutate()} testID="profile-save" />

            <Text className="pt-2 text-lg font-display-semibold text-ink">Your data</Text>
            <Button
              disabled={exportData.isPending}
              label="Download my data"
              onPress={() => exportData.mutate()}
              testID="profile-export"
              variant="outline"
            />
            <Button label="Terms and privacy policy" onPress={() => router.push("/legal")} variant="ghost" />

            {confirmingDelete ? (
              <View className="gap-2">
                <Text className="text-base font-sans text-neutral-700">
                  This deletes your login and anonymizes your customer record. Past appointments stay in the shop's records without your name, phone or email; notes you wrote on an appointment are kept as written, so contact the shop if you want them removed. This cannot be undone.
                </Text>
                <Button
                  disabled={remove.isPending}
                  label="Yes, delete my account"
                  onPress={() => remove.mutate()}
                  testID="profile-delete-confirm"
                  variant="danger"
                />
                <Button label="Keep my account" onPress={() => setConfirmingDelete(false)} variant="ghost" />
              </View>
            ) : (
              <Button label="Delete my account" onPress={() => setConfirmingDelete(true)} testID="profile-delete" variant="outline" />
            )}

            <Toast
              message={feedback?.message ?? ""}
              onDismiss={() => setFeedback(null)}
              variant={feedback?.variant ?? "info"}
              visible={feedback !== null}
            />
            <Button
              label="Sign out"
              onPress={async () => {
                try {
                  await signOut(supabase);
                } catch (caught) {
                  fail(caught, "Unable to sign out.");
                }
              }}
              variant="dark"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
