import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type DropdownColors = {
  text: string;
  background: string;
  card: string;
  surface: string;
  tint: string;
  subtle: string;
  border: string;
};

export type AppDropdownOption<T extends string> = {
  label: string;
  value: T;
  description?: string;
  swatches?: string[];
};

type AppDropdownProps<T extends string> = {
  label?: string;
  value: T;
  options: AppDropdownOption<T>[];
  colors: DropdownColors;
  onChange: (value: T) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
};

export function AppDropdown<T extends string>({
  label,
  value,
  options,
  colors,
  onChange,
  disabled,
  placeholder = "Choose one",
}: AppDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const chooseOption = async (nextValue: T) => {
    setOpen(false);
    await onChange(nextValue);
  };

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: colors.subtle }]}>{label}</Text>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.84}
        style={[
          styles.button,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `Open ${label} dropdown` : "Open dropdown"}
      >
        <View style={styles.buttonCopy}>
          {selected?.swatches?.length ? (
            <View style={styles.swatchRow}>
              {selected.swatches.slice(0, 3).map((swatch) => (
                <View
                  key={swatch}
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch, borderColor: colors.border },
                  ]}
                />
              ))}
            </View>
          ) : null}
          <Text style={[styles.buttonText, { color: colors.text }]}>
            {selected?.label ?? placeholder}
          </Text>
          {selected?.description ? (
            <Text style={[styles.buttonDescription, { color: colors.subtle }]}>
              {selected.description}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.chevron, { color: colors.subtle }]}>v</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              styles.menu,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {label ? (
              <Text style={[styles.menuTitle, { color: colors.text }]}>
                {label}
              </Text>
            ) : null}

            <ScrollView style={styles.optionList} showsVerticalScrollIndicator>
              {options.map((option) => {
                const active = option.value === value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.option,
                      {
                        backgroundColor: active ? colors.surface : colors.background,
                        borderColor: active ? colors.tint : colors.border,
                      },
                    ]}
                    onPress={() => chooseOption(option.value)}
                  >
                    {option.swatches?.length ? (
                      <View style={styles.swatchRow}>
                        {option.swatches.slice(0, 3).map((swatch) => (
                          <View
                            key={`${option.value}-${swatch}`}
                            style={[
                              styles.swatch,
                              {
                                backgroundColor: swatch,
                                borderColor: colors.border,
                              },
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionText, { color: colors.text }]}>
                        {option.label}
                      </Text>
                      {option.description ? (
                        <Text
                          style={[
                            styles.optionDescription,
                            { color: colors.subtle },
                          ]}
                        >
                          {option.description}
                        </Text>
                      ) : null}
                    </View>

                    {active ? (
                      <Text style={[styles.activeMark, { color: colors.tint }]}>
                        Active
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: colors.surface }]}
              onPress={() => setOpen(false)}
            >
              <Text style={[styles.closeText, { color: colors.text }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  label: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  button: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  buttonCopy: {
    flex: 1,
    paddingRight: 10,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "900",
  },
  buttonDescription: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  chevron: {
    fontSize: 22,
    fontWeight: "900",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.48)",
    justifyContent: "center",
    padding: 20,
  },
  menu: {
    borderWidth: 1,
    borderRadius: 24,
    maxHeight: "78%",
    padding: 16,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },
  optionList: {
    maxHeight: 420,
  },
  option: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  optionCopy: {
    flex: 1,
    paddingRight: 8,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "900",
  },
  optionDescription: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  activeMark: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  swatchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    marginRight: -2,
  },
  closeButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  closeText: {
    fontSize: 14,
    fontWeight: "900",
  },
});
