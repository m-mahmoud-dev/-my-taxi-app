import { useSignUp } from "@clerk/clerk-expo";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { ReactNativeModal } from "react-native-modal";

import CustomButton from "@/components/CustomButton";
import InputField from "@/components/InputField";
import OAuth from "@/components/OAuth";
import { icons, images } from "@/constants";
import { t } from "@/lib/i18n";
import { formatPhoneInput, PLACEHOLDER, validatePhone } from "@/lib/phone";

const SignUp = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [phoneError, setPhoneError] = useState("");
  const [verification, setVerification] = useState({
    state: "default",
    error: "",
    code: "",
  });

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    const phone = validatePhone(form.phone);
    if (!phone.valid) {
      setPhoneError(phone.error ?? "Invalid phone number");
      return;
    }
    setPhoneError("");

    try {
      await signUp.create({
        emailAddress: form.email,
        password: form.password,
        publicMetadata: { phone: phone.e164 },
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerification({
        ...verification,
        state: "pending",
      });
    } catch (err: any) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.log(JSON.stringify(err, null, 2));
      Alert.alert(t("common.error"), err.errors[0].longMessage);
    }
  };
  const onPressVerify = async () => {
    if (!isLoaded) return;
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: verification.code,
      });
      if (completeSignUp.status === "complete") {
        await setActive({ session: completeSignUp.createdSessionId });
        setVerification({
          ...verification,
          state: "success",
        });
      } else {
        setVerification({
          ...verification,
          error: t("verify.failed"),
          state: "failed",
        });
      }
    } catch (err: any) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      setVerification({
        ...verification,
        error: err.errors[0].longMessage,
        state: "failed",
      });
    }
  };
  return (
    <ScrollView className="flex-1 bg-white">
      <View className="flex-1 bg-white">
        <View className="relative w-full h-[250px]">
          <Image source={images.signUpCar} className="z-0 w-full h-[250px]" />
          <Text className="text-2xl text-black font-JakartaSemiBold absolute bottom-5 left-5">
            {t("signup.title")}
          </Text>
        </View>
        <View className="p-5">
          <InputField
            label={t("signup.name")}
            placeholder={t("signup.namePlaceholder")}
            icon={icons.person}
            value={form.name}
            onChangeText={(value) => setForm({ ...form, name: value })}
          />
          <InputField
            label={t("signup.email")}
            placeholder={t("signup.emailPlaceholder")}
            icon={icons.email}
            textContentType="emailAddress"
            value={form.email}
            onChangeText={(value) => setForm({ ...form, email: value })}
          />
          <InputField
            label={t("signup.password")}
            placeholder={t("signup.passwordPlaceholder")}
            icon={icons.lock}
            secureTextEntry={true}
            textContentType="password"
            value={form.password}
            onChangeText={(value) => setForm({ ...form, password: value })}
          />
          <InputField
            label={t("signup.phone")}
            placeholder={PLACEHOLDER}
            icon={icons.person}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={form.phone}
            onChangeText={(value) => {
              setForm({ ...form, phone: formatPhoneInput(value) });
              if (phoneError) setPhoneError("");
            }}
            onBlur={() => {
              const phone = validatePhone(form.phone);
              setPhoneError(phone.valid ? "" : (phone.error ?? ""));
            }}
          />
          {form.phone.length > 0 && !validatePhone(form.phone).valid && (
            <Text className="text-red-500 text-sm mt-1">{phoneError}</Text>
          )}
          <CustomButton
            title={t("signup.submit")}
            onPress={onSignUpPress}
            className="mt-6"
          />
          <OAuth />
          <Link
            href="/sign-in"
            className="text-lg text-center text-general-200 mt-10"
          >
            {t("signup.haveAccount")}{" "}
            <Text className="text-primary-500">{t("signup.signIn")}</Text>
          </Link>
        </View>
        <ReactNativeModal
          isVisible={verification.state === "pending"}
          onModalHide={() => {
            if (verification.state === "success") {
              setShowSuccessModal(true);
            }
          }}
        >
          <View className="bg-white px-7 py-9 rounded-2xl min-h-[300px]">
            <Text className="font-JakartaExtraBold text-2xl mb-2">
              {t("verify.title")}
            </Text>
            <Text className="font-Jakarta mb-5">
              {t("verify.sentTo", undefined, { email: form.email })}
            </Text>
            <InputField
              label={t("verify.code")}
              icon={icons.lock}
              placeholder={t("verify.placeholder")}
              value={verification.code}
              keyboardType="numeric"
              onChangeText={(code) =>
                setVerification({ ...verification, code })
              }
            />
            {verification.error && (
              <Text className="text-red-500 text-sm mt-1">
                {verification.error}
              </Text>
            )}
            <CustomButton
              title={t("verify.submit")}
              onPress={onPressVerify}
              className="mt-5 bg-success-500"
            />
          </View>
        </ReactNativeModal>
        <ReactNativeModal isVisible={showSuccessModal}>
          <View className="bg-white px-7 py-9 rounded-2xl min-h-[300px]">
            <Image
              source={images.check}
              className="w-[110px] h-[110px] mx-auto my-5"
            />
            <Text className="text-3xl font-JakartaBold text-center">
              {t("verify.successTitle")}
            </Text>
            <Text className="text-base text-gray-400 font-Jakarta text-center mt-2">
              {t("verify.successDesc")}
            </Text>
            <CustomButton
              title={t("verify.browseHome")}
              onPress={() => router.push(`/(root)/(tabs)/home`)}
              className="mt-5"
            />
          </View>
        </ReactNativeModal>
      </View>
    </ScrollView>
  );
};
export default SignUp;
