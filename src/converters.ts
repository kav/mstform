import { IObservableArray, observable } from "mobx";
import { IModelType, IAnyModelType, Instance } from "mobx-state-tree";
import {
  CONVERSION_ERROR,
  ConversionResponse,
  ConversionValue,
  Converter,
  IConverter
} from "./converter";
import { Controlled, controlled } from "./controlled";
import { identity } from "./utils";

const NUMBER_REGEX = new RegExp("^-?(0|[1-9]\\d*)(\\.\\d*)?$");
const INTEGER_REGEX = new RegExp("^-?(0|[1-9]\\d*)$");

export class StringConverter<V> extends Converter<string, V> {
  defaultControlled = controlled.value;
  preprocessRaw(raw: string): string {
    return raw.trim();
  }
}

const string = new StringConverter<string>({
  emptyRaw: "",
  convert(raw) {
    return raw;
  },
  render(value) {
    return value;
  }
});

const number = new StringConverter<number>({
  emptyRaw: "",
  rawValidate(raw) {
    // deal with case when string starts with .
    if (raw.startsWith(".")) {
      raw = "0" + raw;
    }
    return NUMBER_REGEX.test(raw);
  },
  convert(raw) {
    return +raw;
  },
  render(value) {
    return value.toString();
  }
});

const integer = new StringConverter<number>({
  emptyRaw: "",
  rawValidate(raw) {
    return INTEGER_REGEX.test(raw);
  },
  convert(raw) {
    return +raw;
  },
  render(value) {
    return value.toString();
  }
});

const boolean = new Converter<boolean, boolean>({
  emptyRaw: false,
  convert(raw) {
    return raw;
  },
  render(value) {
    return value;
  },
  defaultControlled: controlled.checked,
  neverRequired: true
});

export interface DecimalOptions {
  maxWholeDigits?: number;
  decimalPlaces?: number;
  allowNegative?: boolean;
}

class Decimal implements IConverter<string, string> {
  public converter: StringConverter<string>;

  emptyRaw: string;
  defaultControlled = controlled.value;
  neverRequired = false;

  constructor(options?: DecimalOptions) {
    const maxWholeDigits: number =
      options == null || !options.maxWholeDigits ? 10 : options.maxWholeDigits;
    const decimalPlaces: number =
      options == null || !options.decimalPlaces ? 2 : options.decimalPlaces;
    const allowNegative: boolean =
      options == null || options.allowNegative == null
        ? true
        : options.allowNegative;

    this.emptyRaw = "";
    const regex = new RegExp(
      `^${allowNegative ? `-?` : ``}(0|[1-9]\\d{0,${maxWholeDigits -
        1}})(\\.\\d{0,${decimalPlaces}})?$`
    );

    this.converter = new StringConverter<string>({
      emptyRaw: "",
      rawValidate(raw) {
        if (raw === "" || raw === ".") {
          return false;
        }
        // deal with case when string starts with .
        if (raw.startsWith(".")) {
          raw = "0" + raw;
        }
        return regex.test(raw);
      },
      convert(raw) {
        return raw;
      },
      render(value) {
        return value;
      }
    });
  }

  preprocessRaw(raw: string): string {
    return raw.trim();
  }

  convert(raw: string) {
    return this.converter.convert(raw);
  }
  render(value: string) {
    return this.converter.render(value);
  }
  getRaw(value: any) {
    return value;
  }
}

function decimal(options?: DecimalOptions): IConverter<string, string> {
  return new Decimal(options);
}

// XXX create a way to create arrays with mobx state tree types
const stringArray = new Converter<string[], IObservableArray<string>>({
  emptyRaw: [],
  convert(raw) {
    return observable.array(raw);
  },
  render(value) {
    return value.slice();
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
  if (converter instanceof StringConverter || converter instanceof Decimal) {
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
  if (converter instanceof StringConverter || converter instanceof Decimal) {
    return new StringMaybe(converter, null);
  }
  return maybeModel(converter, null, null) as IConverter<R | null, V | null>;
}

class StringMaybe<V, RE, VE> implements IConverter<string, V | VE> {
  emptyRaw: string;
  defaultControlled = controlled.value;
  neverRequired = false;

  constructor(public converter: IConverter<string, V>, public emptyValue: VE) {
    this.emptyRaw = "";
  }

  preprocessRaw(raw: string): string {
    return raw.trim();
  }

  async convert(raw: string): Promise<ConversionResponse<V | VE>> {
    if (raw.trim() === "") {
      return new ConversionValue(this.emptyValue);
    }
    return this.converter.convert(raw);
  }

  render(value: V | VE): string {
    if (value === this.emptyValue) {
      return "";
    }
    return this.converter.render(value as V);
  }
}

class Model<M, RE> implements IConverter<Instance<M> | RE, Instance<M>> {
  emptyRaw: Instance<M> | RE;
  defaultControlled: Controlled;
  neverRequired = false;

  constructor(model: M, emptyRaw: RE) {
    this.emptyRaw = emptyRaw;
    this.defaultControlled = controlled.object;
  }
  preprocessRaw(raw: Instance<M>): Instance<M> {
    return raw;
  }

  async convert(
    raw: Instance<M> | RE
  ): Promise<ConversionResponse<Instance<M>>> {
    if (raw === this.emptyRaw) {
      return CONVERSION_ERROR;
    }
    return new ConversionValue(raw as Instance<M>);
  }

  render(value: Instance<M>): Instance<M> {
    return value;
  }
}

function model<M extends IAnyModelType>(
  model: M
): IConverter<Instance<M> | null, Instance<M>> {
  return new Model(model, null);
}

function maybeModel<M, RE, VE>(
  converter: IConverter<M | RE, M | VE>,
  emptyRaw: RE,
  emptyValue: VE
): IConverter<M | RE, M | VE> {
  return new Converter({
    emptyRaw: emptyRaw,
    convert: (r: M | RE) => (r !== emptyRaw ? (r as M) : emptyValue),
    render: (v: M | VE) => (v !== emptyValue ? (v as M) : emptyRaw),
    defaultControlled: controlled.object
  });
}

const object = new Converter<any, any>({
  emptyRaw: null,
  convert: identity,
  render: identity
});

export const converters = {
  string,
  number,
  integer,
  decimal,
  boolean,
  stringArray,
  maybe,
  maybeNull,
  model,
  object
};
