import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { rentalService } from "./rental.service";
import { customerService } from "../customers/customer.service";
import { useItems } from "../../hooks/useInventory";
import {
  CreateRentalData,
  RentalService,
  RentalTypeAPI,
  RentalTypeUI,
  RentalWorkAddress,
  RentalFulfillmentMethod,
} from "../../types/rental.types";
import { EMPTY_ITEMS, Item } from "../../types/inventory.types";
import {
  Customer,
  CustomerAddress,
  EMPTY_CUSTOMERS,
} from "../../types/customer.types";
import Layout from "../../components/Layout";
import {
  formatDocumentForDisplay,
  isValidCpfCnpj,
  todayDateInputValue,
  formatCurrencyBr,
  formatMoneyInputBr,
  parseMoneyBr,
} from "../../utils/formatters";
import {
  formatBrazilZipCodeDigits,
  lookupBrazilZipViaCep,
  normalizeBrazilZipDigits,
} from "../../utils/viacep";
import { toast } from "react-toastify";

type CustomersListResult = Awaited<
  ReturnType<typeof customerService.getCustomers>
>;

export const rentalTypeMapper: Record<RentalTypeUI, RentalTypeAPI> = {
  diario: "daily",
  semanal: "weekly",
  quinzenal: "biweekly",
  mensal: "monthly",
};

const workAddressFromCustomerAddress = (addr: CustomerAddress): RentalWorkAddress => ({
  workName:
    addr.workName ||
    addr.addressName ||
    (addr.type === "main"
      ? "Endereço Principal"
      : addr.type === "billing"
        ? "Endereço de Cobrança"
        : "Outro Endereço"),
  street: addr.street || "",
  number: addr.number,
  complement: addr.complement,
  neighborhood: addr.neighborhood,
  city: addr.city || "",
  state: addr.state || "",
  zipCode: addr.zipCode || "",
  workId: addr._id,
});

const selectNumericInputContents = (
  e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>,
) => {
  e.currentTarget.select();
};

interface SelectedItem {
  itemId: string;
  quantity: number;
  unitId?: string;
  rentalType?: RentalTypeUI;
  pickupDate?: string; // string ou Date
  pickupTime?: string;
  returnDate?: string; // string ou Date
  /** Devolução anterior a hoje: item já entregue naquela data (somente histórico) */
  historicalDelivery?: boolean;
  item: Item;
}
interface ServiceFormRow extends RentalService {
  priceInput: string;
}

interface Totals {
  equipmentSubtotal: number;
  servicesSubtotal: number;
  subtotal: number;
  total: number;
  rentalPeriod: { start: string; end: string };
}

const rentalTypeMap: Record<
  RentalTypeUI,
  "daily" | "weekly" | "biweekly" | "monthly"
> = {
  diario: "daily",
  semanal: "weekly",
  quinzenal: "biweekly",
  mensal: "monthly",
};

const rentalTypeLabels: Record<RentalTypeUI, string> = {
  diario: "diário",
  semanal: "semanal",
  quinzenal: "quinzenal",
  mensal: "mensal",
};

const getRateForRentalType = (item: Item, rentalType: RentalTypeUI): number => {
  const pricing = item.pricing ?? {};
  const apiType = rentalTypeMap[rentalType];
  const rates = {
    daily: pricing.dailyRate ?? 0,
    weekly: pricing.weeklyRate ?? 0,
    biweekly: pricing.biweeklyRate ?? 0,
    monthly: pricing.monthlyRate ?? 0,
  };
  return Number(rates[apiType] || 0);
};

const CreateRentalPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [services, setServices] = useState<ServiceFormRow[]>([]);
  const [workAddress, setWorkAddress] = useState<RentalWorkAddress | null>(
    null,
  );
  const [saveWorkAddress] = useState(false);
  const [selectedWorkAddressIndex, setSelectedWorkAddressIndex] =
    useState<string>("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [customerCpf, setCustomerCpf] = useState("");
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<RentalFulfillmentMethod | "">("");
  const [pickedUpBy, setPickedUpBy] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discountValueInput, setDiscountValueInput] = useState("");
  const [discountType, setDiscountType] = useState<"value" | "percentage">("value");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [rentalType] = useState<
    "diario" | "semanal" | "quinzenal" | "mensal"
  >("diario");
  const [workZipLookupLoading, setWorkZipLookupLoading] = useState(false);
  const [workZipLookupMessage, setWorkZipLookupMessage] = useState("");

  const [sort, setSort] = useState<
    "name" | "name_desc" | "price" | "price_desc" | "available"
  >("name");
  const [showItemsModal, setShowItemsModal] = useState(false);

  const { data: customersData } = useQuery<CustomersListResult>({
    queryKey: ["customers"],
    queryFn: () => customerService.getCustomers({ limit: 100 }),
  });

  const { data: itemsData, refetch: refetchItems } = useItems({
    isActive: true,
    limit: 100,
  });

  const allCustomers: Customer[] = useMemo(() => {
    const list = customersData?.data ?? EMPTY_CUSTOMERS;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [customersData]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const search = customerSearch.toLowerCase().trim();
    return allCustomers.filter((customer) => {
      const matchesName = customer.name.toLowerCase().includes(search);
      const searchDigits = normalizeDocument(search);
      const matchesCnpj =
        customer.cpfCnpj?.toLowerCase().includes(search) ||
        (!!searchDigits && normalizeDocument(customer.cpfCnpj || "").includes(searchDigits));
      return matchesName || matchesCnpj;
    });
  }, [allCustomers, customerSearch]);

  const selectedCustomerData = useMemo(
    () => allCustomers.find((c) => c._id === selectedCustomer) ?? null,
    [allCustomers, selectedCustomer],
  );

  const financialAlertsQuery = useQuery({
    queryKey: ["customer-rental-financial-alerts", selectedCustomer],
    queryFn: () => customerService.getRentalFinancialAlerts(selectedCustomer),
    enabled: Boolean(selectedCustomer),
    staleTime: 30_000,
  });

  const financialAlerts = financialAlertsQuery.data;
  const hasFinancialAlerts =
    !!financialAlerts &&
    (financialAlerts.overdueCharges.count > 0 ||
      financialAlerts.overdueBillingsWithoutCharge.count > 0);

  function normalizeDocument(value: string) {
    return value.replace(/\D/g, "");
  }

  const formatDocumentInput = (value: string) => {
    const digits = normalizeDocument(value).slice(0, 14);
    if (digits.length <= 11) {
      return digits
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
    }
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
  };

  const selectedCustomerDocumentDigits = normalizeDocument(
    selectedCustomerData?.cpfCnpj || "",
  );
  const rentalDocumentDigits = normalizeDocument(customerCpf);
  const customerHasValidDocument = isValidCpfCnpj(selectedCustomerDocumentDigits);

  const mergeWorkAddress = (partial: Partial<RentalWorkAddress>) => {
    setWorkAddress((prev) =>
      ({
        ...(prev ?? ({} as RentalWorkAddress)),
        ...partial,
      }) as RentalWorkAddress,
    );
  };

  const lookupWorkAddressFromCep = async (digitsFromInput?: string) => {
    const digits =
      digitsFromInput !== undefined
        ? normalizeBrazilZipDigits(digitsFromInput)
        : normalizeBrazilZipDigits(workAddress?.zipCode ?? "");
    if (digits.length !== 8) {
      setWorkZipLookupMessage("Digite um CEP com 8 dígitos para buscar.");
      return;
    }
    setWorkZipLookupLoading(true);
    setWorkZipLookupMessage("");
    const result = await lookupBrazilZipViaCep(digits);
    setWorkZipLookupLoading(false);
    if (!result.ok) {
      setWorkZipLookupMessage(result.message);
      return;
    }
    const { data } = result;
    setWorkAddress((prev) =>
      ({
        ...(prev ?? ({} as RentalWorkAddress)),
        zipCode: data.zipFormatted,
        street: data.street || prev?.street || "",
        neighborhood: data.neighborhood || prev?.neighborhood || "",
        city: data.city || prev?.city || "",
        state: data.state || prev?.state || "",
      }) as RentalWorkAddress,
    );
    setWorkZipLookupMessage("Endereço preenchido automaticamente pelo CEP.");
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateRentalData) => rentalService.createRental(data),
  });

  function parseLocalDate(dateString: string) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const calculatePrice = (
    item: Item,
    quantity: number,
    startDate: Date,
    endDate: Date | null,
    rentalType: RentalTypeAPI,
  ) => {
    const pricing = item.pricing ?? {};
    let effectiveEndDate = endDate ? new Date(endDate) : new Date(startDate);
    const diffTime = effectiveEndDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const daysPassed = Math.max(1, rentalType === "daily" ? diffDays : diffDays + 1);
    const daily = pricing.dailyRate ?? 0;
    const periodDays: Record<RentalTypeAPI, number> = {
      daily: 1,
      weekly: 7,
      biweekly: 15,
      monthly: 30,
    };
    const periodRates: Record<RentalTypeAPI, number> = {
      daily,
      weekly: pricing.weeklyRate ?? 0,
      biweekly: pricing.biweeklyRate ?? 0,
      monthly: pricing.monthlyRate ?? 0,
    };

    const periodLength = periodDays[rentalType];
    const periodsCompleted = Math.floor(daysPassed / periodLength);
    const extraDays = daysPassed % periodLength;
    const totalPrice =
      rentalType === "daily"
        ? daily * Math.max(1, periodsCompleted)
        : periodRates[rentalType] * periodsCompleted + daily * extraDays;

    return Number((totalPrice * quantity).toFixed(2));
  };

  const calculateTotals = (): Totals => {
    if (selectedItems.length === 0) {
      return {
        equipmentSubtotal: 0,
        servicesSubtotal: 0,
        subtotal: 0,
        total: 0,
        rentalPeriod: { start: "", end: "" },
      };
    }

    let equipmentSubtotal = 0;
    let servicesSubtotal = 0;

    let minPickup: Date | null = null;
    let maxReturn: Date | null = null;

    selectedItems.forEach((item) => {
      //usar parseLocalDate (corrige timezone)
      const itemPickup: Date | null = item.pickupDate
        ? parseLocalDate(item.pickupDate)
        : null;

      const itemReturn: Date | null = item.returnDate
        ? parseLocalDate(item.returnDate)
        : null;

      if (itemPickup && (!minPickup || itemPickup < minPickup))
        minPickup = itemPickup;

      if (itemReturn && (!maxReturn || itemReturn > maxReturn))
        maxReturn = itemReturn;

      if (itemPickup) {
        const rentalTypeAPI = item.rentalType
          ? rentalTypeMapper[item.rentalType]
          : "daily";

        const price = calculatePrice(
          item.item,
          item.quantity,
          itemPickup,
          itemReturn,
          rentalTypeAPI,
        );

        equipmentSubtotal += price;
      }
    });

    services.forEach((service) => {
      servicesSubtotal += service.subtotal;
    });

    const subtotal = equipmentSubtotal + servicesSubtotal;
    const discountAmount =
      discountType === "percentage"
        ? (subtotal * discount) / 100
        : discount;
    const total = subtotal - discountAmount;

    //evitar toISOString (bug de fuso)
    const formatDate = (date: Date | null) => {
      if (!date) return "";
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const rentalPeriod = {
      start: formatDate(minPickup),
      end: formatDate(maxReturn),
    };

    return {
      equipmentSubtotal,
      servicesSubtotal,
      subtotal,
      total: Math.max(0, total),
      rentalPeriod,
    };
  };

  const handleAddItem = (item: Item) => {
    if (item.trackingType === "unit") {
      const availableUnits =
        item.units?.filter((u) => u.status === "available") || [];
      if (availableUnits.length === 0) {
        toast.warning(
          `O item "${item.name}" não possui unidades disponíveis para aluguel.`,
        );
        return;
      }
    }

    //definir tipo automaticamente pelo item
    const getRentalTypeFromItem = (item: Item): RentalTypeUI => {
      if (item.pricing.monthlyRate) return "mensal";
      if (item.pricing.biweeklyRate) return "quinzenal";
      if (item.pricing.weeklyRate) return "semanal";
      return "diario";
    };

    const rentalType = getRentalTypeFromItem(item);
    const defaultPickupDate = pickupDate || selectedItems[0]?.pickupDate || "";
    const defaultPickupTime = pickupTime || selectedItems[0]?.pickupTime || "";

    const existingIndex = selectedItems.findIndex(
      (si) => si.itemId === item._id,
    );

    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      if (item.trackingType !== "unit") {
        const available = item.quantity.available || 0;
        if (updated[existingIndex].quantity >= available) {
          toast.warn(
            `Estoque disponível para "${item.name}": ${available}.`,
          );
          return;
        }
        updated[existingIndex].quantity += 1;
      }
      setSelectedItems(updated);
    } else {
      //já calcula a devolução mínima
      const calculatedReturn = defaultPickupDate
        ? calculateReturnDate(defaultPickupDate, rentalType)
        : "";

      setSelectedItems([
        ...selectedItems,
        {
          itemId: item._id,
          quantity: 1,
          item,
          pickupDate: defaultPickupDate,
          pickupTime: defaultPickupTime,
          returnDate: calculatedReturn,
          rentalType,
        },
      ]);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((si) => si.itemId !== itemId));
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setSelectedItems(
      selectedItems.map((si) => {
        if (si.itemId !== itemId) return si;
        if (si.item.trackingType === "unit") return { ...si, quantity: 1 };

        const available = si.item.quantity.available || 0;
        const nextQuantity = Math.min(quantity, available);
        if (quantity > available) {
          toast.warn(
            `Estoque disponível para "${si.item.name}": ${available}.`,
          );
        }

        return { ...si, quantity: Math.max(1, nextQuantity) };
      }),
    );
  };

  const addService = () => {
    setServices([
      ...services,
      {
        description: "",
        price: 0,
        priceInput: "",
        quantity: 1,
        subtotal: 0,
        category: "",
      },
    ]);
  };

  const updateService = (
    index: number,
    field: keyof ServiceFormRow,
    value: string | number,
  ) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], [field]: value };

    if (field === "price" || field === "quantity") {
      newServices[index].subtotal =
        newServices[index].price * newServices[index].quantity;
    }

    setServices(newServices);
  };

  const handleServicePriceBlur = (index: number, rawValue: string) => {
    const parsed = parseMoneyBr(rawValue);
    const price = Number.isFinite(parsed) ? parsed : 0;
    const newServices = [...services];
    newServices[index] = {
      ...newServices[index],
      price,
      priceInput: formatMoneyInputBr(price),
      subtotal: price * newServices[index].quantity,
    };
    setServices(newServices);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleCustomerChange = (newCustomerId: string) => {
    setSelectedCustomer(newCustomerId);
    setShowCustomerDropdown(false);
    setCustomerSearch("");
    setSelectedWorkAddressIndex("");
    setWorkAddress(null);
    const customer = allCustomers.find((c) => c._id === newCustomerId);
    setCustomerCpf(formatDocumentInput(customer?.cpfCnpj || ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const missingFields: string[] = [];
    if (!selectedCustomer) missingFields.push("cliente");
    const documentToSubmit = rentalDocumentDigits || selectedCustomerDocumentDigits;
    if (!documentToSubmit) missingFields.push("CPF/CNPJ do cliente");
    if (!fulfillmentMethod) missingFields.push("entrega ou retirada");
    if (!pickedUpBy.trim()) missingFields.push("quem retirou/entregou");
    if (selectedItems.length === 0) {
      if ((itemsData?.data ?? EMPTY_ITEMS).length === 0) {
        toast.warning("Nenhum item disponível no inventário para alugar.");
        return;
      }
      missingFields.push("itens do aluguel");
    }

    if (missingFields.length > 0) {
      toast.warning(`Preencha os campos obrigatórios: ${missingFields.join(", ")}.`);
      return;
    }

    if (workAddress) {
      const addrMissing: string[] = [];
      if (!workAddress.workName?.trim()) addrMissing.push("nome da obra");
      if (!workAddress.street?.trim()) addrMissing.push("rua");
      if (!workAddress.city?.trim()) addrMissing.push("cidade");
      if (!workAddress.state?.trim()) addrMissing.push("estado");
      if (!workAddress.zipCode?.trim()) addrMissing.push("CEP");
      if (addrMissing.length > 0) {
        toast.warning(`Preencha o endereço da obra: ${addrMissing.join(", ")}.`);
        return;
      }
    }

    if (!isValidCpfCnpj(documentToSubmit)) {
      toast.warning("Informe um CPF/CNPJ válido para o cliente.");
      return;
    }

    if (selectedItems.length === 0) {
      toast.warning("Adicione pelo menos um item.");
      return;
    }

    const today = todayDateInputValue();
    const hasRetroactive = selectedItems.some(
      (si) =>
        (si.pickupDate && si.pickupDate < today) ||
        (si.returnDate && si.returnDate < today),
    );
    if (
      hasRetroactive ||
      (pickupDate && pickupDate < today)
    ) {
      const shouldContinue = window.confirm(
        "Você informou uma data anterior a hoje. Tem certeza de que deseja continuar?",
      );
      if (!shouldContinue) return;
    }

    const formatDateTimeToISO = (dateStr: string, timeStr = "00:00") => {
      const [year, month, day] = dateStr.split("-").map(Number);
      const [hours, minutes] = timeStr.split(":").map(Number);
      const d = new Date(year, month - 1, day, hours || 0, minutes || 0);
      return d.toISOString();
    };

    const freshItemsResult = await refetchItems();
    const freshItems: Item[] =
      freshItemsResult.data?.data ?? itemsData?.data ?? EMPTY_ITEMS;
    const refreshedSelectedItems = selectedItems.map((si) => {
      const freshItem = freshItems.find((item) => item._id === si.itemId);
      return freshItem ? { ...si, item: freshItem } : si;
    });
    setSelectedItems(refreshedSelectedItems);

    for (const si of refreshedSelectedItems) {
      const selectedRentalType = si.rentalType ?? rentalType;
      if (getRateForRentalType(si.item, selectedRentalType) <= 0) {
        toast.warning(
          `Cadastre o valor ${rentalTypeLabels[selectedRentalType]} do item "${si.item.name}" antes de concluir o aluguel.`,
        );
        return;
      }
      if (si.item.trackingType === "unit" && !si.unitId) {
        toast.warning(`Selecione uma unidade disponível para o item "${si.item.name}".`);
        return;
      }
      if (si.item.trackingType === "unit" && si.unitId) {
        const unit = si.item.units?.find((u) => u.unitId === si.unitId);
        if (!unit || unit.status !== "available") {
          const availableUnits =
            si.item.units
              ?.filter((u) => u.status === "available")
              .map((u) => u.unitId)
              .join(", ") || "nenhuma";
          toast.warning(
            `A unidade ${si.unitId} do item "${si.item.name}" não está mais disponível. Unidades disponíveis: ${availableUnits}.`,
          );
          return;
        }
      }
      if (
        si.item.trackingType !== "unit" &&
        si.quantity > (si.item.quantity.available || 0)
      ) {
        toast.warning(
          `Estoque insuficiente para "${si.item.name}". Disponível: ${si.item.quantity.available || 0}. Solicitado: ${si.quantity}.`,
        );
        return;
      }
      if (!si.pickupDate) {
        toast.warning(`Informe a retirada do item "${si.item.name}".`);
        return;
      }
      if (!si.pickupTime) {
        toast.warning(`Informe o horário de entrega/retirada do item "${si.item.name}".`);
        return;
      }
      if (si.returnDate && si.pickupDate && si.returnDate < si.pickupDate) {
        toast.warning(
          `A devolução do item "${si.item.name}" deve ser posterior à retirada.`,
        );
        return;
      }
    }

    const servicesToSend = services.map((s) => ({
      description: s.description.trim(),
      price: Number(s.price) || 0,
      quantity: Number(s.quantity) || 1,
      subtotal: (Number(s.price) || 0) * (Number(s.quantity) || 1),
      category: s.category?.trim() || "",
    }));

    const data: CreateRentalData = {
      customerId: selectedCustomer,
      customerCpf: documentToSubmit,
      fulfillmentMethod: fulfillmentMethod as RentalFulfillmentMethod,
      pickedUpBy: pickedUpBy.trim() || undefined,
      items: refreshedSelectedItems.map((si) => {
        const uiType = si.rentalType ?? rentalType; // fallback da tela
        const row: CreateRentalData["items"][number] = {
          itemId: si.itemId,
          unitId: si.item.trackingType === "unit" ? si.unitId : undefined,
          quantity: si.quantity,
          rentalType: rentalTypeMapper[uiType],
          pickupScheduled: formatDateTimeToISO(
            si.pickupDate as string,
            si.pickupTime,
          ),
          returnScheduled: si.returnDate
            ? formatDateTimeToISO(si.returnDate, si.pickupTime)
            : undefined,
        };
        if (
          si.returnDate &&
          si.returnDate < today &&
          si.historicalDelivery === true
        ) {
          row.historicalDelivery = true;
        }
        return row;
      }),

      services: servicesToSend.length > 0 ? servicesToSend : undefined,
      workAddress: workAddress || undefined,
      dates: pickupDate
        ? {
            pickupScheduled: formatDateTimeToISO(pickupDate, pickupTime),
          }
        : undefined,
      pricing: {
        discount:
          discountType === "percentage"
            ? (totals.subtotal * discount) / 100
            : discount,
      },
      notes,
    };

    createMutation.mutate(data, {
      onSuccess: async (res) => {
        if (
          saveWorkAddress &&
          selectedCustomer &&
          workAddress &&
          !workAddress.workId
        ) {
          const missing = [];
          if (!workAddress.workName?.trim()) missing.push("nome da obra");
          if (!workAddress.street?.trim()) missing.push("rua");
          if (!workAddress.city?.trim()) missing.push("cidade");
          if (!workAddress.state?.trim()) missing.push("estado");
          if (!workAddress.zipCode?.trim()) missing.push("CEP");
          if (missing.length > 0) {
            toast.warning(`Preencha o endereço da obra: ${missing.join(", ")}.`);
            return;
          }
          try {
            await customerService.addAddress(selectedCustomer, {
              addressName: workAddress.workName || "Obra",
              type: "work",
              workName: workAddress.workName,
              street: workAddress.street,
              number: workAddress.number,
              complement: workAddress.complement,
              neighborhood: workAddress.neighborhood,
              city: workAddress.city,
              state: workAddress.state,
              zipCode: workAddress.zipCode,
              country: "Brasil",
              isDefault: false,
            });
          } catch {
            toast.error("Aluguel criado, mas não foi possível salvar o endereço no cadastro do cliente.");
          }
        }

        if (res?.data?._id) {
          try {
            const blob = await rentalService.generateRentalPDF(res.data._id);
            const url = window.URL.createObjectURL(
              new Blob([blob], { type: "application/pdf" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `locacao-${res.data._id}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
          } catch {
            // Mantém o fluxo mesmo se o PDF falhar
          }

          toast.success("Aluguel criado com sucesso.");
          navigate("/rentals");
          return;
        }

        toast.success("Aluguel criado com sucesso.");
        navigate("/rentals");
      },
      onError: (err: any) => {
        const message =
          err.response?.data?.message || "Erro ao processar a requisição";
        toast.error(message);
      },
    });
  };

  const totals = calculateTotals();
  const items: Item[] = itemsData?.data ?? EMPTY_ITEMS;

  const customerAddresses = useMemo(
    () => selectedCustomerData?.addresses ?? [],
    [selectedCustomerData?.addresses],
  );

  const applyCustomerAddressAtIndex = useCallback(
    (index: number) => {
      const addr = customerAddresses[index];
      if (!addr) return;
      setSelectedWorkAddressIndex(String(index));
      setWorkAddress(workAddressFromCustomerAddress(addr));
    },
    [customerAddresses],
  );

  const totalsWithRentalType = {
    ...totals,
    // apenas copia, sem multiplicar
    subtotal: totals.subtotal,
    total: totals.total,
    equipmentSubtotal: totals.equipmentSubtotal,
    servicesSubtotal: totals.servicesSubtotal,
  };

  const calculateReturnDate = (pickup: string, type: RentalTypeUI) => {
    if (!pickup) return "";

    //corrigido (sem bug de fuso)
    const [year, month, day] = pickup.split("-").map(Number);
    const pickupDateObj = new Date(year, month - 1, day);

    let daysToAdd = 1;

    switch (type) {
      case "diario":
        daysToAdd = 1;
        break;
      case "semanal":
        daysToAdd = 6;
        break;
      case "quinzenal":
        daysToAdd = 14;
        break;
      case "mensal":
        daysToAdd = 29;
        break;
      default:
        daysToAdd = 1;
    }

    const returnDateObj = new Date(pickupDateObj);
    returnDateObj.setDate(returnDateObj.getDate() + daysToAdd);

    //evitar toISOString (timezone bug)
    const y = returnDateObj.getFullYear();
    const m = String(returnDateObj.getMonth() + 1).padStart(2, "0");
    const d = String(returnDateObj.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    if (customerAddresses.length === 1) {
      applyCustomerAddressAtIndex(0);
      return;
    }
    if (customerAddresses.length === 0) {
      setSelectedWorkAddressIndex("");
    }
  }, [customerAddresses, applyCustomerAddressAtIndex]);

  const filteredItems = items.filter((item) => {
    if (item.quantity.available <= 0) return false;

    if (search) {
      const term = search.toLowerCase();

      const matches =
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.sku?.toLowerCase().includes(term) ||
        item.barcode?.toLowerCase().includes(term) ||
        item.customId?.toLowerCase().includes(term);

      if (!matches) return false;
    }

    return true;
  });

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];

    switch (sort) {
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));

      case "name_desc":
        return list.sort((a, b) => b.name.localeCompare(a.name));

      case "price":
        return list.sort(
          (a, b) => (a.pricing?.dailyRate ?? 0) - (b.pricing?.dailyRate ?? 0),
        );

      case "price_desc":
        return list.sort(
          (a, b) => (b.pricing?.dailyRate ?? 0) - (a.pricing?.dailyRate ?? 0),
        );

      case "available":
        return list.sort(
          (a, b) => (b.quantity.available ?? 0) - (a.quantity.available ?? 0),
        );

      default:
        return list;
    }
  }, [filteredItems, sort]);

  return (
    <Layout title="Novo Aluguel" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="app-container">
          {/* Header */}
          <div className="mb-6">
            <Link
              to="/rentals"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
            >
              ← Voltar para Aluguéis
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Items Selection */}
            <div className="lg:col-span-2 space-y-6">
              {/* Customer Selection */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Cliente *
                  </h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Obrigatório
                  </span>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Buscar por nome ou CPF/CNPJ
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Digite o nome ou CPF/CNPJ do cliente"
                      value={selectedCustomer ? (selectedCustomerData?.name || "") : customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        if (!selectedCustomer) {
                          setShowCustomerDropdown(true);
                        }
                      }}
                      onFocus={() => {
                        if (!selectedCustomer) {
                          setShowCustomerDropdown(true);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowCustomerDropdown(false), 200);
                      }}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />

                    {selectedCustomer && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer("");
                          setCustomerSearch("");
                          setCustomerCpf("");
                          setSelectedWorkAddressIndex("");
                          setWorkAddress(null);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
                      >
                        ✕
                      </button>
                    )}

                    {showCustomerDropdown && !selectedCustomer && filteredCustomers.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                        {filteredCustomers.slice(0, 20).map((customer) => (
                          <button
                            key={customer._id}
                            type="button"
                            onClick={() => handleCustomerChange(customer._id)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-b-0 transition-colors"
                          >
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {customer.name}
                            </div>
                            {customer.cpfCnpj && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDocumentForDisplay(customer.cpfCnpj)}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {showCustomerDropdown &&
                      !selectedCustomer &&
                      customerSearch.trim() &&
                      filteredCustomers.length === 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 p-4">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Nenhum cliente encontrado
                          </p>
                        </div>
                      )}
                  </div>
                </div>
                {selectedCustomer && selectedCustomerData && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Cliente selecionado:</span>{" "}
                      {selectedCustomerData.name}
                    </p>
                  </div>
                )}
                {selectedCustomer && selectedCustomerData && financialAlertsQuery.isLoading && (
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Verificando pendências financeiras…
                  </p>
                )}
                {selectedCustomer && selectedCustomerData && financialAlertsQuery.isError && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                    Não foi possível carregar as pendências financeiras deste cliente.
                  </p>
                )}
                {selectedCustomer && selectedCustomerData && hasFinancialAlerts && financialAlerts && (
                  <div
                    role="alert"
                    className="mt-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200"
                  >
                    <p className="font-semibold mb-2">
                      Atenção: há pendências financeiras neste cliente
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {financialAlerts.overdueCharges.count > 0 ? (
                        <li>
                          {financialAlerts.overdueCharges.count}{" "}
                          {financialAlerts.overdueCharges.count === 1
                            ? "cobrança vencida em aberto"
                            : "cobranças vencidas em aberto"}
                          {" — total "}
                          <strong>
                            {formatCurrencyBr(financialAlerts.overdueCharges.totalOutstanding)}
                          </strong>
                        </li>
                      ) : null}
                      {financialAlerts.overdueBillingsWithoutCharge.count > 0 ? (
                        <li>
                          {financialAlerts.overdueBillingsWithoutCharge.count}{" "}
                          {financialAlerts.overdueBillingsWithoutCharge.count === 1
                            ? "fechamento já vencido sem cobrança nem fatura gerada"
                            : "fechamentos já vencidos sem cobrança nem fatura geradas"}
                          {" — total "}
                          <strong>
                            {formatCurrencyBr(
                              financialAlerts.overdueBillingsWithoutCharge.totalOutstanding,
                            )}
                          </strong>
                        </li>
                      ) : null}
                    </ul>
                    <p className="mt-2 text-xs opacity-90">
                      Use essas informações para decidir se convém regularizar o financeiro antes
                      de novos aluguéis.
                    </p>
                  </div>
                )}
                {selectedCustomer && selectedCustomerData && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      CPF/CNPJ do cliente *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customerCpf}
                      onChange={(e) => setCustomerCpf(formatDocumentInput(e.target.value))}
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      maxLength={18}
                      required
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    {!customerHasValidDocument && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        Este cliente não possui CPF/CNPJ válido cadastrado. O documento
                        informado aqui será salvo no cadastro do cliente.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Items Selection */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Itens Selecionados
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Adicione itens pelo modal de busca
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowItemsModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-colors"
                  >
                    <span className="text-base leading-none">+</span>
                    Adicionar item
                  </button>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Nenhum item selecionado ainda.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                      {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} selecionado{selectedItems.length !== 1 ? "s" : ""}
                    </div>
                    <div className="space-y-4">
                      {selectedItems.map((selectedItem, selectedIndex) => (
                        <div
                          key={selectedItem.itemId}
                          className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="font-medium text-gray-900 dark:text-white">
                                  {selectedItem.item.name}
                                </h3>

                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                  {selectedItem.pickupDate
                                    ? `${formatCurrencyBr(
                                        calculatePrice(
                                        selectedItem.item,
                                        1,
                                        new Date(selectedItem.pickupDate),
                                        selectedItem.returnDate
                                          ? new Date(selectedItem.returnDate)
                                          : null,
                                        selectedItem.rentalType
                                          ? rentalTypeMap[
                                              selectedItem.rentalType
                                            ]
                                          : "daily",
                                      ),
                                    )}/un`
                                    : "Defina a retirada"}
                                </span>
                              </div>

                              {/* Unidade */}
                              {selectedItem.item.trackingType === "unit" && (
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-gray-500">
                                    Unidade *
                                  </label>
                                  <select
                                    value={selectedItem.unitId || ""}
                                    onChange={(e) => {
                                      const updated = selectedItems.map((si) =>
                                        si.itemId === selectedItem.itemId
                                          ? { ...si, unitId: e.target.value }
                                          : si,
                                      );
                                      setSelectedItems(updated);
                                    }}
                                    required
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  >
                                    <option value="">Selecione...</option>
                                    {selectedItem.item.units
                                      ?.filter((u) => u.status === "available")
                                      .map((unit) => (
                                        <option
                                          key={unit.unitId}
                                          value={unit.unitId}
                                        >
                                          Unidade: {unit.unitId}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              )}

                              {/* BLOCO PRINCIPAL (tipo + datas) */}
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-500 mb-1">
                                    Tipo de cobrança
                                  </label>

                                  <select
                                    value={
                                      selectedItem.rentalType ?? rentalType
                                    }
                                    onChange={(e) => {
                                      const newType = e.target
                                        .value as RentalTypeUI;
                                      setSelectedItems(
                                        selectedItems.map((si) => {
                                          if (si.itemId !== selectedItem.itemId)
                                            return si;
                                          const nextReturn = si.pickupDate
                                            ? calculateReturnDate(
                                                si.pickupDate,
                                                newType,
                                              )
                                            : si.returnDate;
                                          return {
                                            ...si,
                                            rentalType: newType,
                                            returnDate: nextReturn || si.returnDate,
                                          };
                                        }),
                                      );
                                    }}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  >
                                    <option value="diario">Diário</option>
                                    <option value="semanal">
                                      Semanal (7 dias)
                                    </option>
                                    <option value="quinzenal">
                                      Quinzenal (15 dias)
                                    </option>
                                    <option value="mensal">Mensal (30 dias)</option>
                                  </select>
                                </div>
                                {/* Retirada */}
                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-500 mb-1">
                                    Data de entrega/retirada
                                  </label>
                                  <input
                                    type="date"
                                    value={selectedItem.pickupDate || ""}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (selectedIndex === 0) {
                                        setPickupDate(value);
                                      }

                                      const updated = selectedItems.map(
                                        (si) => {
                                          if (
                                            selectedIndex !== 0 &&
                                            si.itemId !== selectedItem.itemId
                                          ) {
                                            return si;
                                          }
                                          if (
                                            selectedIndex === 0 ||
                                            si.itemId === selectedItem.itemId
                                          ) {
                                            const newReturn = value
                                              ? calculateReturnDate(
                                                  value,
                                                  si.rentalType ?? "diario",
                                                )
                                              : si.returnDate;

                                            return {
                                              ...si,
                                              pickupDate: value,
                                              returnDate: newReturn,
                                            };
                                          }
                                          return si;
                                        },
                                      );

                                      setSelectedItems(updated);
                                    }}
                                    required
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>

                                {/* Horário */}
                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-500 mb-1">
                                    Horário *
                                  </label>
                                  <input
                                    type="time"
                                    value={selectedItem.pickupTime || ""}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (selectedIndex === 0) {
                                        setPickupTime(value);
                                      }

                                      setSelectedItems(
                                        selectedItems.map((si) => {
                                          if (
                                            selectedIndex !== 0 &&
                                            si.itemId !== selectedItem.itemId
                                          ) {
                                            return si;
                                          }
                                          return { ...si, pickupTime: value };
                                        }),
                                      );
                                    }}
                                    required
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>

                                {/* Devolução prevista */}
                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-500 mb-1">
                                    Devolução prevista
                                  </label>
                                  <div className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-100 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300">
                                    {selectedItem.returnDate || "Calculada após a retirada"}
                                  </div>
                                </div>
                              </div>

                              {selectedItem.returnDate &&
                                selectedItem.returnDate < todayDateInputValue() && (
                                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={
                                        selectedItem.historicalDelivery === true
                                      }
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setSelectedItems(
                                          selectedItems.map((si) =>
                                            si.itemId === selectedItem.itemId
                                              ? {
                                                  ...si,
                                                  historicalDelivery: checked
                                                    ? true
                                                    : undefined,
                                                }
                                              : si,
                                          ),
                                        );
                                      }}
                                      className="mt-0.5 rounded border-gray-300"
                                    />
                                    <span>
                                      Item já devolvido nesta data (registro
                                      histórico). Se desmarcado, o sistema
                                      gera fechamentos até a data de hoje
                                      conforme o tipo de cobrança.
                                    </span>
                                  </label>
                                )}

                              <div className="text-xs text-gray-500">
                                Os itens podem ter períodos diferentes. O
                                aluguel encerra somente após a devolução do
                                último item.
                              </div>
                            </div>

                            {/* Quantidade e botão remover */}
                            <div className="flex flex-col items-end gap-2 ml-4">
                              {selectedItem.item.trackingType === "unit" ? (
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  <span className="font-medium">Qtd: 1</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-gray-700 dark:text-gray-300">
                                    Qtd:
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={selectedItem.item.quantity.available}
                                    value={selectedItem.quantity}
                                    onFocus={selectNumericInputContents}
                                    onClick={selectNumericInputContents}
                                    onChange={(e) =>
                                      handleQuantityChange(
                                        selectedItem.itemId,
                                        parseInt(e.target.value) || 1,
                                      )
                                    }
                                    className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  />
                                </div>
                              )}
                              <button
                                onClick={() =>
                                  handleRemoveItem(selectedItem.itemId)
                                }
                                className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-sm font-medium flex items-center gap-1 transition-colors"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Serviços Adicionais */}
                <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Serviços Adicionais
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Ex: Frete, Limpeza, Instalação, etc.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addService}
                      className="bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white px-4 py-2.5 rounded-md text-sm font-medium shadow-sm hover:shadow transition-colors flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Adicionar Serviço
                    </button>
                  </div>

                  {services.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Nenhum serviço adicionado
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {services.map((service, index) => (
                        <div
                          key={index}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors bg-white dark:bg-gray-800"
                        >
                          {/* Primeira linha - 3 campos */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                            <div className="md:col-span-5">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Descrição *
                              </label>
                              <input
                                type="text"
                                value={service.description}
                                onChange={(e) =>
                                  updateService(
                                    index,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                placeholder="Ex: Frete Alfenas-Fama"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              />
                            </div>

                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Categoria
                              </label>
                              <input
                                type="text"
                                value={service.category}
                                onChange={(e) =>
                                  updateService(
                                    index,
                                    "category",
                                    e.target.value,
                                  )
                                }
                                placeholder="Ex: frete, limpeza"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              />
                            </div>

                            <div className="md:col-span-4">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Subtotal
                              </label>
                              <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 rounded-md text-sm font-medium text-gray-900 dark:text-white">
                                {formatCurrencyBr(service.subtotal)}
                              </div>
                            </div>
                          </div>

                          {/* Segunda linha - 3 campos */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Preço Unitário (R$) *
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                                    R$
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0,00"
                                  value={service.priceInput}
                                  onChange={(e) =>
                                    updateService(
                                      index,
                                      "priceInput",
                                      e.target.value,
                                    )
                                  }
                                  onBlur={(e) =>
                                    handleServicePriceBlur(index, e.target.value)
                                  }
                                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm tabular-nums"
                                />
                              </div>
                            </div>

                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Quantidade
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={service.quantity}
                                onFocus={selectNumericInputContents}
                                onClick={selectNumericInputContents}
                                onChange={(e) =>
                                  updateService(
                                    index,
                                    "quantity",
                                    parseInt(e.target.value) || 1,
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                              />
                            </div>

                            <div className="md:col-span-4">
                              <div className="flex items-end justify-between gap-3">
                                <div className="flex-1">
                                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                    Cálculo:
                                  </div>
                                  <div className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                                    {formatCurrencyBr(service.price)} ×{" "}
                                    {service.quantity} ={" "}
                                    {formatCurrencyBr(service.subtotal)}
                                  </div>
                                </div>

                                <div>
                                  <button
                                    type="button"
                                    onClick={() => removeService(index)}
                                    className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-300 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-700 rounded-md transition-colors flex items-center justify-center"
                                    title="Remover serviço"
                                  >
                                    <svg
                                      className="w-5 h-5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Endereço da Obra */}
                {selectedCustomerData && (
                  <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Endereço da Obra
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Opcional - para devolução no local
                        </p>
                      </div>
                      {customerAddresses.length > 0 && (
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">
                            Usar endereço salvo:
                          </label>
                          <select
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            value={selectedWorkAddressIndex}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "") {
                                setSelectedWorkAddressIndex("");
                                setWorkAddress(null);
                                return;
                              }
                              applyCustomerAddressAtIndex(Number(value));
                            }}
                          >
                            <option value="">Selecione um endereço</option>
                            {customerAddresses.map((address, index) => (
                              <option key={index} value={index}>
                                {address.workName ||
                                  address.addressName ||
                                  address.street ||
                                  `Endereço ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Nome da Obra
                          </label>
                          <input
                            type="text"
                            value={workAddress?.workName || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                workName: e.target.value,
                              } as RentalWorkAddress)
                            }
                            placeholder="Ex: Construção Residencial"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="md:col-span-1">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            CEP
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="postal-code"
                              placeholder="00000-000"
                              maxLength={9}
                              value={workAddress?.zipCode || ""}
                              onChange={(e) => {
                                mergeWorkAddress({
                                  zipCode: formatBrazilZipCodeDigits(e.target.value),
                                });
                                setWorkZipLookupMessage("");
                              }}
                              onBlur={(e) => {
                                const d = normalizeBrazilZipDigits(e.target.value);
                                if (d.length === 8) {
                                  void lookupWorkAddressFromCep(d);
                                }
                              }}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                            <button
                              type="button"
                              disabled={workZipLookupLoading}
                              onClick={() => void lookupWorkAddressFromCep()}
                              className="shrink-0 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 whitespace-nowrap"
                            >
                              {workZipLookupLoading ? "Buscando…" : "Buscar CEP"}
                            </button>
                          </div>
                          {workZipLookupMessage ? (
                            <p
                              className={`mt-1 text-xs ${workZipLookupMessage.includes("preenchido") ? "text-green-700 dark:text-green-400" : "text-amber-800 dark:text-amber-300"}`}
                            >
                              {workZipLookupMessage}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Rua
                          </label>
                          <input
                            type="text"
                            value={workAddress?.street || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                street: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Número
                          </label>
                          <input
                            type="text"
                            value={workAddress?.number || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                number: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Bairro
                          </label>
                          <input
                            type="text"
                            value={workAddress?.neighborhood || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                neighborhood: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Cidade
                          </label>
                          <input
                            type="text"
                            value={workAddress?.city || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                city: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Estado
                          </label>
                          <input
                            type="text"
                            value={workAddress?.state || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                state: e.target.value,
                              } as RentalWorkAddress)
                            }
                            maxLength={2}
                            placeholder="UF"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm uppercase"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                  Resumo do Aluguel
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Observações
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Instruções especiais, detalhes da obra, etc."
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Desconto
                    </label>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountType("value");
                          setDiscountValueInput(
                            discount > 0 ? formatMoneyInputBr(discount) : "",
                          );
                        }}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          discountType === "value"
                            ? "bg-gray-900 dark:bg-gray-700 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                        }`}
                      >
                        R$ (Valor)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("percentage")}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          discountType === "percentage"
                            ? "bg-gray-900 dark:bg-gray-700 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                        }`}
                      >
                        % (Porcentagem)
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={discountType === "percentage" ? "number" : "text"}
                        inputMode={
                          discountType === "percentage" ? undefined : "decimal"
                        }
                        min={discountType === "percentage" ? 0 : undefined}
                        max={discountType === "percentage" ? 100 : undefined}
                        step={discountType === "percentage" ? "0.1" : undefined}
                        value={
                          discountType === "percentage"
                            ? discount
                            : discountValueInput
                        }
                        onChange={(e) => {
                          if (discountType === "percentage") {
                            setDiscount(
                              e.target.value === "" ? 0 : Number(e.target.value),
                            );
                            return;
                          }
                          setDiscountValueInput(e.target.value);
                        }}
                        onBlur={(e) => {
                          if (discountType !== "value") return;
                          const parsed = parseMoneyBr(e.target.value);
                          const next = Number.isFinite(parsed) ? parsed : 0;
                          setDiscount(next);
                          setDiscountValueInput(formatMoneyInputBr(next));
                        }}
                        placeholder={
                          discountType === "percentage" ? "Ex: 10" : "0,00"
                        }
                        className="w-full px-4 py-3 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm tabular-nums"
                      />
                      <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-400 font-medium">
                        {discountType === "percentage" ? "%" : "R$"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Entrega dos itens *
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <label className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                        <input
                          type="radio"
                          name="fulfillmentMethod"
                          value="delivery_service"
                          checked={fulfillmentMethod === "delivery_service"}
                          onChange={() => setFulfillmentMethod("delivery_service")}
                          required
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Serviço de entrega
                        </span>
                      </label>
                      <label className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                        <input
                          type="radio"
                          name="fulfillmentMethod"
                          value="store_pickup"
                          checked={fulfillmentMethod === "store_pickup"}
                          onChange={() => setFulfillmentMethod("store_pickup")}
                          required
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Retirado na locadora
                        </span>
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Quem retirou/entregou *
                      </label>
                      <input
                        type="text"
                        value={pickedUpBy}
                        onChange={(e) => setPickedUpBy(e.target.value)}
                        placeholder="Nome de quem retirou ou entregou"
                        required
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>

                  {/* Resumo dos itens */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">
                        Equipamentos:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrencyBr(totalsWithRentalType.equipmentSubtotal)}
                      </span>
                    </div>

                    {totalsWithRentalType.servicesSubtotal > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">
                          Serviços:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatCurrencyBr(totalsWithRentalType.servicesSubtotal)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Subtotal:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrencyBr(totalsWithRentalType.subtotal)}
                      </span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between items-center text-red-600 dark:text-red-400">
                        <span>
                          Desconto{" "}
                          {discountType === "percentage"
                            ? `(${discount}%)`
                            : "(R$)"}
                          :
                        </span>
                        <span className="font-medium">
                          {discountType === "percentage"
                            ? `- ${formatCurrencyBr(
                                (totalsWithRentalType.subtotal * discount) / 100,
                              )}`
                            : `- ${formatCurrencyBr(discount)}`}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        Total:
                      </span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrencyBr(totalsWithRentalType.total)}
                      </span>
                    </div>
                  </div>

                  {/* Botão de criação */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={
                        createMutation.isPending || selectedItems.length === 0
                      }
                      className={`w-full py-3.5 px-4 rounded-md text-sm font-medium shadow-sm transition-all ${
                        createMutation.isPending || selectedItems.length === 0
                          ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                          : "bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white hover:shadow"
                      }`}
                    >
                      {createMutation.isPending
                        ? "Criando aluguel..."
                        : selectedItems.length === 0
                          ? "Selecione pelo menos 1 item"
                          : `Criar Aluguel • ${formatCurrencyBr(totalsWithRentalType.total)}`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showItemsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 dark:bg-gray-900/75 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Buscar itens disponíveis
              </h3>
              <button
                type="button"
                onClick={() => setShowItemsModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por nome, descrição ou código..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {filteredItems.length} itens encontrados
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-700"
                >
                  <option value="name">Nome A-Z</option>
                  <option value="name_desc">Nome Z-A</option>
                  <option value="price">Preço menor</option>
                  <option value="price_desc">Preço maior</option>
                  <option value="available">Disponibilidade</option>
                </select>
              </div>
              <div className="space-y-3">
                {sortedItems.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{item.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {formatCurrencyBr(item.pricing.dailyRate)}/dia • Disponível: {item.quantity.available}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className="ml-4 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      + Adicionar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default CreateRentalPage;
