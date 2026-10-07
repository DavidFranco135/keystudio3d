from dataclasses import dataclass


@dataclass(frozen=True)
class CostBreakdown:
    material_cost: float
    waste_cost: float
    energy_cost: float
    machine_cost: float
    labor_cost: float
    packaging_cost: float
    fees: float
    production_cost: float
    tax_amount: float
    suggested_price: float
    # De onde veio o preço do produto: "manual" (digitado), "pricing" (peça de
    # mesmo nome salva na Precificação) ou "recipe" (calculado pela receita).
    source: str = "recipe"
