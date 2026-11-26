import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { CepInput, PhoneInput } from "../../src/components/ui/MaskedInputs";
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
