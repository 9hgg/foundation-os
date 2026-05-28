model SimpleFirstOrder
  Real x(start = 0);
  parameter Real u = 1;
  parameter Real tau = 2;
equation
  der(x) = (u - x) / tau;
end SimpleFirstOrder;
