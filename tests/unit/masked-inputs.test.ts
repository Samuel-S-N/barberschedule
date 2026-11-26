import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { CepInput, MoneyInput, PhoneInput } from "../../src/components/ui/MaskedInputs";
import i18n from "../../src/i18n";

describe("CepInput", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("stops at 9 characters (00000-000)", async () => {
    const view = await render(React.createElement(CepInput, { label: "ZIP", onChangeValue: jest.fn(), testID: "cep", value: "" }));

    expect(view.getByTestId("cep").props.maxLength).toBe(9);
  });

  it.each([["01310100", "01310-100"], ["01310-100", "01310-100"], ["", ""], ["013", "013"], ["013101", "01310-1"]])("always DISPLAYS a stored value (digits or old formatted) as 00000-000: %s", async (stored, shown) => {
    const view = await render(React.createElement(CepInput, { label: "ZIP", onChangeValue: jest.fn(), testID: "cep", value: stored }));

    expect(view.getByTestId("cep").props.value).toBe(shown);
  });

  it("masks typed digits", async () => {
    const onChangeValue = jest.fn();
    const view = await render(React.createElement(CepInput, { label: "ZIP", onChangeValue, testID: "cep", value: "" }));

    await fireEvent.changeText(view.getByTestId("cep"), "01310100");

    expect(onChangeValue).toHaveBeenCalledWith("01310-100");
  });
});

describe("PhoneInput", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows the stored digits formatted", async () => {
    const view = await render(React.createElement(PhoneInput, { label: "Phone", onChangeValue: jest.fn(), testID: "phone", value: "11912345678" }));

    expect(view.getByTestId("phone").props.value).toBe("(11) 91234-5678");
  });

  it("shows an old stored value, formatted the old way, in the new format", async () => {
    const view = await render(React.createElement(PhoneInput, { label: "Phone", onChangeValue: jest.fn(), testID: "phone", value: "(11)91234-5678" }));

    expect(view.getByTestId("phone").props.value).toBe("(11) 91234-5678");
  });

  it("reports digits only while the user types", async () => {
    const onChangeValue = jest.fn();
    const view = await render(React.createElement(PhoneInput, { label: "Phone", onChangeValue, testID: "phone", value: "" }));

    await fireEvent.changeText(view.getByTestId("phone"), "(11) 9a1234-56");
    expect(onChangeValue).toHaveBeenLastCalledWith("119123456");

    await fireEvent.changeText(view.getByTestId("phone"), "+55 11 91234-5678");
    expect(onChangeValue).toHaveBeenLastCalledWith("11912345678");
  });

  it("uses the phone keyboard", async () => {
    const view = await render(React.createElement(PhoneInput, { label: "Phone", onChangeValue: jest.fn(), testID: "phone", value: "" }));

    expect(view.getByTestId("phone").props.keyboardType).toBe("phone-pad");
  });
});

describe("MoneyInput", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("opens an existing value formatted (the text the screens seed with centsToReaisInput)", async () => {
    const view = await render(React.createElement(MoneyInput, { label: "Price", onChangeValue: jest.fn(), testID: "money", value: "45,00" }));

    expect(view.getByTestId("money").props.value).toBe("R$ 45,00");
  });

  it("is empty, not R$ 0,00, when there is no value", async () => {
    const view = await render(React.createElement(MoneyInput, { label: "Price", onChangeValue: jest.fn(), testID: "money", value: "" }));

    expect(view.getByTestId("money").props.value).toBe("");
  });

  it("fills from the cents while typing and reports the formatted text", async () => {
    const onChangeValue = jest.fn();
    const view = await render(React.createElement(MoneyInput, { label: "Price", onChangeValue, testID: "money", value: "" }));

    await fireEvent.changeText(view.getByTestId("money"), "4500");
    expect(onChangeValue).toHaveBeenLastCalledWith("R$ 45,00");

    await fireEvent.changeText(view.getByTestId("money"), "123456");
    expect(onChangeValue).toHaveBeenLastCalledWith("R$ 1.234,56");
  });

  it("backspace removes the last digit", async () => {
    const onChangeValue = jest.fn();
    const view = await render(React.createElement(MoneyInput, { label: "Price", onChangeValue, testID: "money", value: "R$ 1.234,56" }));

    await fireEvent.changeText(view.getByTestId("money"), "R$ 1.234,5");
    expect(onChangeValue).toHaveBeenLastCalledWith("R$ 123,45");
  });

  it("uses the number keyboard", async () => {
    const view = await render(React.createElement(MoneyInput, { label: "Price", onChangeValue: jest.fn(), testID: "money", value: "" }));

    expect(view.getByTestId("money").props.keyboardType).toBe("number-pad");
  });
});
