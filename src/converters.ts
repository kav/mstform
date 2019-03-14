import { IObservableArray, observable } from "mobx";
import { IAnyModelType, Instance } from "mobx-state-tree";
import {
  ConversionResponse,
  ConversionValue,
  Converter,
  IConverter,
  StateConverterOptionsWithContext,
  ConvertError
} from "./converter";
import { controlled } from "./controlled";
import { identity } from "./utils";
import {
  checkConverterOptions,
  convertSeparators,
  DecimalOptions,
  getRegex,
  renderSeparators,
  trimDecimals,
  getOptions
} from "./decimal";
import { parseDecimal, renderDecimal } from "./decimalParser";

const NUMBER_REGEX = new RegExp("^-?(0|[1-9]\\d*)(\\.\\d*)?$");
const INTEGER_REGEX = new RegExp("^-?(0|[1-9]\\d*)$");

export class StringConverter<V> extends Converter<string, V> {
  defaultControlled = controlled.value;
}

const string = new StringConverter<string>({
  emptyRaw: "",
  emptyValue: "",
  convert(raw) {
    return raw;
  },
  render(value) {
    return value;
  },
  preprocessRaw(raw: string): string {
    return raw.trim();
  }
});

const number = new StringConverter<number>({
  emptyRaw: "",
  emptyImpossible: true,
  convert(raw, converterOptions) {
    checkConverterOptions(converterOptions);
    try {
      return +parseDecimal(raw, {
        maxWholeDigits: 100,
        decimalPlaces: 100,
        allowNegative: true,
        addZeroes: false,
        decimalSeparator: converterOptions.decimalSeparator || ".",
        thousandSeparator: converterOptions.thousandSeparator || ",",
        renderThousands: converterOptions.renderThousands || false
      });
    } catch (e) {
      throw new ConvertError();
    }
  },
  render(value, converterOptions) {
    return renderDecimal(value.toString(), {
      maxWholeDigits: 100,
      decimalPlaces: 100,
      allowNegative: true,
      addZeroes: false,
      decimalSeparator: converterOptions.decimalSeparator || ".",
      thousandSeparator: converterOptions.thousandSeparator || ",",
      renderThousands: converterOptions.renderThousands || false
    });
  },
  preprocessRaw(
    raw: string,
    options: StateConverterOptionsWithContext
  ): string {
    return raw.trim();
  }
});

const integer = new StringConverter<number>({
  emptyRaw: "",
  emptyImpossible: true,
  rawValidate(raw) {
    return INTEGER_REGEX.test(raw);
  },
  convert(raw) {
    return +raw;
  },
  render(value) {
    return value.toString();
  },
  preprocessRaw(raw: string): string {
    return raw.trim();
  }
});

const boolean = new Converter<boolean, boolean>({
  emptyRaw: false,
  emptyImpossible: true,
  convert(raw) {
    return raw;
  },
  render(value) {
    return value;
  },
  defaultControlled: controlled.checked,
  neverRequired: true
});

function decimal(
  decimalOptions?:
    | Partial<DecimalOptions>
    | ((context: any) => Partial<DecimalOptions>)
) {
  return new StringConverter<string>({
    emptyRaw: "",
    emptyImpossible: true,
    defaultControlled: controlled.value,
    neverRequired: false,
    preprocessRaw(raw: string): string {
      return raw.trim();
    },
    convert(raw, converterOptions) {
      checkConverterOptions(converterOptions);
      const options = getOptions(converterOptions.context, decimalOptions);
      try {
        return parseDecimal(raw, {
          ...options,
          addZeroes: true,
          decimalSeparator: converterOptions.decimalSeparator || ".",
          thousandSeparator: converterOptions.thousandSeparator || ",",
          renderThousands: converterOptions.renderThousands || false
        });
      } catch (e) {
        throw new ConvertError();
      }
    },
    render(value, converterOptions) {
      const options = getOptions(converterOptions.context, decimalOptions);

      return renderDecimal(value, {
        ...options,
        addZeroes: true,
        decimalSeparator: converterOptions.decimalSeparator || ".",
        thousandSeparator: converterOptions.thousandSeparator || ",",
        renderThousands: converterOptions.renderThousands || false
      });
    }
  });
}

// XXX create a way to create arrays with mobx state tree types
const stringArray = new Converter<string[], IObservableArray<string>>({
  emptyRaw: [],
  emptyValue: observable.array([]),
  convert(raw) {
    return observable.array(raw);
  },
  render(value) {
    return value.slice();
  }
});

const textStringArray = new Converter<string, IObservableArray<string>>({
  emptyRaw: "",
  emptyValue: observable.array([]),
  defaultControlled: controlled.value,
  convert(raw) {
    const rawSplit = raw.split("\n").map(r => r.trim());
    if (rawSplit.length === 1 && rawSplit[0] === "") {
      return observable.array([]);
    }
    return observable.array(rawSplit);
  },
  render(value) {
    return value.join("\n");
  }
});

function maybe<R, V>(
  converter: StringConverter<V>
): IConverter<string, V | undefined>;
function maybe<M>(
  converter: IConverter<M | null, M | undefined>
): IConverter<M | null, M | undefined>;
function maybe<R, V>(
  converter: IConverter<R, V>
): IConverter<string, V | undefined> | IConverter<R | null, V | undefined> {
  if (converter instanceof StringConverter) {
    return new StringMaybe(converter, undefined);
  }
  return maybeModel(converter, null, undefined) as IConverter<
    R | null,
    V | undefined
  >;
}

function maybeNull<R, V>(
  converter: StringConverter<V>
): IConverter<string, V | null>;
function maybeNull<M>(
  converter: IConverter<M | null, M | null>
): IConverter<M | null, M | null>;
function maybeNull<R, V>(
  converter: IConverter<R, V>
): IConverter<string, V | null> | IConverter<R | null, V | null> {
  if (converter instanceof StringConverter) {
    return new StringMaybe(converter, null);
  }
  return maybeModel(converter, null, null) as IConverter<R | null, V | null>;
}

// XXX it would be nice if this could be a simple converter instead
// of a reimplementation. unfortunately the delegation to the
// underlying converter makes this impossible as it has a different
// and asynchronous API. We need to refactor this further in the future.
class StringMaybe<V, RE, VE> implements IConverter<string, V | VE> {
  emptyRaw: string;
  defaultControlled = controlled.value;
  neverRequired = false;
  emptyImpossible: boolean;

  constructor(public converter: IConverter<string, V>, public emptyValue: VE) {
    this.emptyRaw = "";
    this.emptyImpossible = false;
  }

  preprocessRaw(
    raw: string,
    options: StateConverterOptionsWithContext
  ): string {
    raw = raw.trim();
    return this.converter.preprocessRaw(raw, options);
  }

  async convert(
    raw: string,
    options: StateConverterOptionsWithContext
  ): Promise<ConversionResponse<V | VE>> {
    if (raw.trim() === "") {
      return new ConversionValue(this.emptyValue);
    }
    return this.converter.convert(raw, options);
  }

  render(value: V | VE, options: StateConverterOptionsWithContext): string {
    if (value === this.emptyValue) {
      return "";
    }
    return this.converter.render(value as V, options);
  }
}

function model<M extends IAnyModelType>(model: M) {
  return new Converter<Instance<M> | null, Instance<M>>({
    emptyRaw: null,
    emptyImpossible: true,
    defaultControlled: controlled.object,
    neverRequired: false,
    convert(raw) {
      if (raw == null) {
        throw new Error("Raw should never be null at this point");
      }
      return raw;
    },
    render(value) {
      return value;
    }
  });
}

function maybeModel<M, RE, VE>(
  converter: IConverter<M | RE, M | VE>,
  emptyRaw: RE,
  emptyValue: VE
): IConverter<M | RE, M | VE> {
  return new Converter({
    emptyRaw: emptyRaw,
    emptyValue: emptyValue,
    convert: (r: M | RE) => (r !== emptyRaw ? (r as M) : emptyValue),
    render: (v: M | VE) => (v !== emptyValue ? (v as M) : emptyRaw),
    defaultControlled: controlled.object
  });
}

const object = new Converter<any, any>({
  emptyRaw: null,
  emptyValue: undefined,
  convert: identity,
  render: identity
});

export const converters = {
  string,
  number,
  integer,
  decimal,
  boolean,
  textStringArray,
  stringArray,
  maybe,
  maybeNull,
  model,
  object
};
