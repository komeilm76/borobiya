FROM eclipse-temurin:21-jre-jammy

ARG PHOTON_SHA256=a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5
WORKDIR /var/lib/photon
COPY photon-1.3.0.jar /opt/photon.jar
RUN echo "$PHOTON_SHA256  /opt/photon.jar" | sha256sum -c -

EXPOSE 2322
ENTRYPOINT ["java", "-jar", "/opt/photon.jar"]
CMD ["serve", "-listen-ip", "0.0.0.0", "-listen-port", "2322"]
