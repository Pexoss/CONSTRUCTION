import React from "react";

export const selectInputText = (
  e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>,
) => {
  e.currentTarget.select();
};
