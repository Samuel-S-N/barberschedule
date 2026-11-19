import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { CepInput } from "../../src/components/ui/MaskedInputs";
import i18n from "../../src/i18n";

describe("CepInput", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("stops at 9 characters (00000-000)", async () => {
    const view = await render(React.createElement(CepInput, { label: "ZIP", onChangeValue: jest.fn(), testID: "cep", value: "" }));

    expect(view.getByTestId("cep").props.maxLength).toBe(9);
  });

  it("masks typed digits", async () => {
    const onChangeValue = jest.fn();
    const view = await render(React.createElement(CepInput, { label: "ZIP", onChangeValue, testID: "cep", value: "" }));

    await fireEvent.changeText(view.getByTestId("cep"), "01310100");

    expect(onChangeValue).toHaveBeenCalledWith("01310-100");
  });
});
