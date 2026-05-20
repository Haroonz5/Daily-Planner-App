import { Keyboard, type ScrollViewProps, type TextInputProps } from "react-native";

export const dismissKeyboard = () => {
  Keyboard.dismiss();
};

/* I added this shared prop bundle so every text box can close the keyboard
   consistently when someone presses Return/Done instead of trapping them inside it. */
export const doneKeyboardProps: Pick<
  TextInputProps,
  "blurOnSubmit" | "returnKeyType" | "onSubmitEditing"
> = {
  blurOnSubmit: true,
  returnKeyType: "done",
  onSubmitEditing: dismissKeyboard,
};

/* I added this for form screens so dragging the page dismisses the keyboard
   and buttons still respond while the keyboard is open. */
export const keyboardScrollViewProps: Pick<
  ScrollViewProps,
  "keyboardDismissMode" | "keyboardShouldPersistTaps"
> = {
  keyboardDismissMode: "on-drag",
  keyboardShouldPersistTaps: "handled",
};
